import { iterTree } from "../toUPLC/_internal/iterTree";
import { IRVar } from "./IRVar";
import { positiveIntAsBytes } from "../utils/positiveIntAsBytes";
import { IRMetadata } from "../interfaces/IRMetadata";
import { Cloneable } from "@harmoniclabs/cbor/dist/utils/Cloneable";
import { blake2b_128 } from "@harmoniclabs/crypto";
import { freezeAll, defineReadOnlyProperty } from "@harmoniclabs/obj-utils";
import { toHex, uint8ArrayEq } from "@harmoniclabs/uint8array-utils";
import { BasePlutsError } from "../../utils/BasePlutsError";
import { ToJson } from "../../utils/ToJson";
import { IRTerm } from "../IRTerm";
import { IHash, IIRParent } from "../interfaces";
import { concatUint8Arr } from "../utils/concatUint8Arr";
import { isIRTerm } from "../utils/isIRTerm";
import { IRApp } from "./IRApp";
import { IRDelayed } from "./IRDelayed";
import { IRForced } from "./IRForced";
import { IRFunc } from "./IRFunc";


export type LettedSetEntry = {
    letted: IRLetted,
    nReferences: number
};

export function jsonLettedSetEntry( entry: LettedSetEntry )
{
    return {
        letted: toHex(entry.letted.hash),
        nReferences: entry.nReferences
    }

}

export interface IRLettedMeta {
    /**
     * force hoisting even if only a single reference is found
     * 
     * useful to hoist letted terms used once in recursive expressions
    **/
    forceHoist: boolean
}

export interface IRLettedMetadata extends IRMetadata {
    meta: IRLettedMeta
}

const defaultLettedMeta: IRLettedMeta = freezeAll({
    forceHoist: false
});
export class IRLetted
    implements Cloneable<IRLetted>, IHash, IIRParent, ToJson, IRLettedMetadata
{
    readonly hash!: Uint8Array;
    markHashAsInvalid!: () => void;

    value!: IRTerm

    /**
     * we need to keep track of the debruijn at which the `IRLetted` is instantiated
     * 
     * this is because stuff like `new IRLetted( new IRVar(0) )` has different meaning 
     * at different DeBruijn levels
     * 
     * knowing the DeBruijn we can differentiate them
     */
    dbn: number

    readonly dependencies!: LettedSetEntry[]

    parent: IRTerm | undefined;

    clone!: () => IRLetted

    readonly meta!: IRLettedMeta

    constructor( DeBruijn: number, toLet: IRTerm, metadata: Partial<IRLettedMeta> = {} )
    {
        if(!(
            Number.isSafeInteger( DeBruijn ) && DeBruijn >= 0 
        )) throw new BasePlutsError(
            "invalid index for an `IRLetted` instance"
        );

        let _dbn: number =  DeBruijn;
        Object.defineProperty(
            this, "dbn",
            {
                get: () => _dbn,
                set: ( newDbn: number ) => {
                    if(!(
                        Number.isSafeInteger( newDbn ) && newDbn >= 0 
                    )) throw new BasePlutsError(
                        "invalid index for an `IRLetted` instance"
                    );

                    if( newDbn === _dbn ){
                        // everything ok
                        // avoid calling `markHashAsInvalid` 
                        return;
                    }

                    this.markHashAsInvalid()
                    _dbn = newDbn;
                },
                enumerable: true,
                configurable: false
            }
        );

        if( !isIRTerm( toLet ) )
        throw new BasePlutsError(
            "letted value was not an IRTerm"
        );

        // initialize without calling "set"
        // cloning here otherwhise breaks the tree
        // TODO: find what is breaking the tree
        // when solved add `this.value.clone()` to the `IRLetted.clone` method below 
        let _value: IRTerm = toLet.clone();
        _value.parent = this;

        // we need the has before setting dependecies
        let hash: Uint8Array | undefined = undefined;
        Object.defineProperty(
            this, "hash", {
                get: () => {
                    if(!( hash instanceof Uint8Array ))
                    {
                        const normalized = getNormalizedLettedArgs( this.dbn, _value );
                        if( normalized === undefined )
                        {
                            // `_value` doesn't includes any `IRVar`
                            // aka. there is nothing to normalize
                            // just use the value regardless of the
                            // `IRLetted` dbn instantiation
                            hash = blake2b_128(
                                concatUint8Arr(
                                    IRLetted.tag,
                                    _value.hash
                                )
                            );
                        }
                        else
                        {
                            hash = blake2b_128(
                                concatUint8Arr(
                                    IRLetted.tag,
                                    positiveIntAsBytes( normalized[0] ),
                                    normalized[1].hash
                                )
                            );
                        }
                    }
                    return hash.slice();
                },
                set: () => {},
                enumerable: true,
                configurable: false
            }
        );
        Object.defineProperty(
            this, "markHashAsInvalid",
            {
                value: () => { 
                    hash = undefined;
                    // tree changed; possibly dependencies too
                    _deps = undefined;
                    this.parent?.markHashAsInvalid()
                },
                writable: false,
                enumerable:  false,
                configurable: false
            }
        );

        // make sure to use the cloned `_value` and NOT `toLet`
        // since we need the same root ( setted trough `parent` )
        let _deps: LettedSetEntry[] | undefined = undefined;
        function _getDeps(): LettedSetEntry[]
        {
            if( _deps === undefined )
            _deps = getSortedLettedSet( getLettedTerms( _value ) );
            return _deps
        }
        
        Object.defineProperty(
            this, "value",
            {
                get: () => _value,
                set: ( newVal: IRTerm ) => {
                    if( !isIRTerm( newVal ) )
                    throw new BasePlutsError(
                        "only closed terms can be hoisted"
                    );
                    this.markHashAsInvalid();
                    _deps = undefined;
                    _value = newVal;
                    _value.parent = this
                },
                enumerable: true,
                configurable: false
            }
        );

        Object.defineProperty(
            this, "dependencies",
            {
                get: (): LettedSetEntry[] => _getDeps().map( dep => {

                    const clone = dep.letted.clone();
                    clone.parent = dep.letted.parent; 
                    return {
                        letted: clone,
                        nReferences: dep.nReferences
                    }
                }), // MUST return clones
                set: () => {},
                enumerable: true,
                configurable: false
            }
        )

        let _parent: IRTerm | undefined = undefined;
        Object.defineProperty(
            this, "parent",
            {
                get: () => _parent,
                set: ( newParent: IRTerm | undefined ) => {

                    if( newParent === undefined || isIRTerm( newParent ) )
                    {
                        _parent = newParent;
                    }

                },
                enumerable: false,
                configurable: false
            }
        );

        Object.defineProperty(
            this, "meta",
            {
                value: {
                    ...defaultLettedMeta,
                    ...metadata
                },
                writable: false,
                enumerable: true,
                configurable: false
            }
        );

        defineReadOnlyProperty(
            this, "clone",
            () => {
                return new IRLetted(
                    this.dbn,
                    this.value, // .clone(), // cloned in constructor
                    this.meta
                )
            }
        );

    }

    static get tag(): Uint8Array { return new Uint8Array([ 0b0000_0101 ]); }

    toJson(): any 
    {
        return {
            type: "IRLetted",
            hash: toHex( this.hash ),
            value: this.value.toJson()
        }
    }
    
}

/**
 * basically an insertion sort;
 * 
 * @param {LettedSetEntry[]} lettedTerms
 * @returns {LettedSetEntry[]} a **new** array with ```IRLetted```s with no dependencies first, followed by the dependents
 */
export function getSortedLettedSet( lettedTerms: LettedSetEntry[] ): LettedSetEntry[]
{
    const set: LettedSetEntry[] = [];
    const hashesSet: Uint8Array[] = [];
     
    /**
     * **O((n * m) * d)**
     * 
     * where
     * 
     *      n = length of set
     *      m = number of terms passed
     *      d = number of unique dependencies among the passed terms
     */
    function addToSet( _terms: LettedSetEntry[] ): void
    {
        for( let i = 0; i < _terms.length; i++ )
        {
            const thisLettedEntry = _terms[i]; 
            const thisHash = thisLettedEntry.letted.hash;

            const idxInSet = hashesSet.findIndex( hash => uint8ArrayEq( hash, thisHash ) )
            // if( !hashesSet.includes( hash ) )
            // "includes" uses standard equality (===)
            if( idxInSet < 0 ) // not present
            {
                // add dependencies first
                // dependencies don't have references to the current letted
                // (of course, wouldn't be much of a dependecy otherwhise)
                //
                // don't add dependecies of dependecies since `dependecies` proerty
                // already calls `getSortedLettedSet( getLettedTerms( _value ) )`
                // so repeating it here would count deps twice (exponentially for deps of deps)
                addToSet( getLettedTerms( thisLettedEntry.letted.value ) );

                hashesSet.push( thisHash );
                set.push({
                    letted: thisLettedEntry.letted,
                    nReferences: thisLettedEntry.nReferences
                });
            }
            else
            {
                const entry = set[ idxInSet ]; 
                entry.nReferences += thisLettedEntry.nReferences;
                entry.letted.meta.forceHoist = 
                    entry.letted.meta.forceHoist || 
                    thisLettedEntry.letted.meta.forceHoist;
            }
        }
    }

    addToSet( lettedTerms );

    return set;
}

export function getLettedTerms( irTerm: IRTerm ): LettedSetEntry[]
{
    const lettedTerms: LettedSetEntry[] = [];

    const stack: IRTerm[] = [ irTerm ];

    while( stack.length > 0 )
    {
        const t = stack.pop() as IRTerm;

        if( t instanceof IRLetted )
        {
            lettedTerms.push({ letted: t, nReferences: 1 });
            continue;
        }

        if( t instanceof IRApp )
        {
            stack.push( t.fn, t.arg );
            continue;
        }

        if( t instanceof IRFunc )
        {
            stack.push( t.body );
            continue;
        }

        if( t instanceof IRForced )
        {
            stack.push( t.forced );
            continue;
        }

        if( t instanceof IRDelayed )
        {
            stack.push( t.delayed );
            continue;
        }
    }

    return lettedTerms;
}


export function getNormalizedLettedArgs( dbn: number, value: IRTerm ): [ normalized_dbn: number, noramlized_value: IRTerm ] | undefined
{
    const normalized_value = value.clone();
    const minDbn = getMinVarDbnIn( normalized_value );

    if( minDbn === undefined ) return undefined;
    
    iterTree( normalized_value, (node) => {
        if( node instanceof IRVar || node instanceof IRLetted )
        {
            node.dbn -= minDbn
        }
    });
    return [ dbn - minDbn, normalized_value ];
}

function getMinVarDbnIn( term: IRTerm ): number | undefined
{
    let min: number | undefined = undefined;

    iterTree( term, (node) => {
        if( node instanceof IRVar )
        {
            min = typeof min === "number" ? Math.min( min, node.dbn ) : node.dbn
        }
    });

    return min;
}