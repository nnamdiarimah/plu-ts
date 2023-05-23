import { isObject } from "@harmoniclabs/obj-utils";
import type { PType } from "../../PType";
import { PInt } from "../PInt";
import { Term } from "../../Term";
import { EnumDefinition, EnumT, MethodsImpl, enum_t, int, isMethodsImpl } from "../../type_system";
import { IRConst } from "../../../IR/IRNodes/IRConst";
import { plet } from "../../lib/plet";
import { getFnTypes } from "../../Script/Parametrized/getFnTypes";
import { papp } from "../../lib";

/**
 * intermediate class useful to reconize structs from primitives
**/
class _PEnum extends PInt
{
    public _isPType: true = true;
    public _PTypeUPLCTerm: any;
    constructor()
    {
        super();
    }
}

export type PEnum<Def extends EnumDefinition> =
{
    new(): _PEnum
} & PInt & {
    readonly [EnumElem in keyof Def]: Term<PEnum<Def>>
}

export function penum<Def extends EnumDefinition>(
    def: Def,
    getImpl: ( self_t: EnumT<Def> ) => MethodsImpl = _self_t => ({})
): PEnum<Def>
{
    if( isObject( def ) ) throw new Error("invalid 'penum' definition; expected an object");

    def = { ...def };
    Object.freeze( def );

    class PEnumExtension extends _PEnum {};

    const self_t = enum_t( def );

    const enums = Object.keys( def );

    if( !enums.every(
        elem => {
            const n = def[ elem ];
            
            return (
                typeof n === "number" &&
                n === Math.round( n )
            );
        })
    )
    throw new Error(
        "invalid 'penum' definition; all values must be integers; enum definition: " +
        JSON.stringify( def, ( k, v ) => typeof v === "bigint" ? v.toString() + "n" : v )
    );

    const impl = typeof getImpl === "function" ? { ...getImpl( self_t ) } : {};
    if( !isMethodsImpl( impl ) ) throw new Error("invalid methods implementation; only plu-ts functions allowed");

    for( const enumElem of enums )
    {
        Object.defineProperty(
            PEnumExtension, enumElem, {
                get: () => new Term( self_t, _dbn => IRConst.int( def[enumElem] ) ),
                set: () => {},
                enumerable: true,
                configurable: false
            }
        )
    }

    const methods = Object.keys( impl );
    const nMethods = methods.length;

    for( let i = 0; i < nMethods; i++ )
    {
        const method = methods[i];
        const theTerm = plet( impl[method] );
        Object.defineProperty(
            PEnumExtension, "p" + method, {
                value: theTerm,
                writable: false,
                enumerable: true,
                configurable: false
            }
        );
        const nArgs = getFnTypes( theTerm.type ).length - 1;
        Object.defineProperty(
            PEnumExtension, method, {
                value: ( ...args: Term<PType>[] ) => {
                    if( args.length < nArgs )
                    throw new Error(
                        "not enough arguments for \"" +
                        method + "\" method; " +
                        nArgs + " args expected"
                    );
                    let term: Term<PType> = theTerm;
                    let n = 0;
                    while( n < nArgs )
                    {
                        term = papp( term as any, args[n] );
                        n++;
                    }
                    return term;
                },
                writable: false,
                enumerable: true,
                configurable: false
            }
        );
    }

    return PEnumExtension as any;
}