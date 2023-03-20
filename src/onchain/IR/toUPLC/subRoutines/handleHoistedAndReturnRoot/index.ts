import { toHex, uint8ArrayEq } from "@harmoniclabs/uint8array-utils";
import { IRApp } from "../../../IRNodes/IRApp";
import { IRDelayed } from "../../../IRNodes/IRDelayed";
import { IRForced } from "../../../IRNodes/IRForced";
import { IRFunc } from "../../../IRNodes/IRFunc";
import { getSortedHoistedSet, getHoistedTerms, IRHoisted, cloneHoistedSetEntry } from "../../../IRNodes/IRHoisted";
import { IRLetted } from "../../../IRNodes/IRLetted";
import { IRVar } from "../../../IRNodes/IRVar";
import { IRTerm } from "../../../IRTerm";
import { _modifyChildFromTo } from "../../_internal/_modifyChildFromTo";
import { PlutsIRError } from "../../../../../errors/PlutsIRError";

export function handleHoistedAndReturnRoot( term: IRTerm ): IRTerm
{
    const directHoisteds = getHoistedTerms( term ).map( cloneHoistedSetEntry );

    const allHoisteds = getSortedHoistedSet( directHoisteds );
    let n = allHoisteds.length;
    
    // nothing to do; shortcut.
    if( n === 0 ) return term;

    // console.log( directHoisteds.map( h => toHex( h.hoisted.hash ) ) );
    
    let a = 0;
    let b = 0;
    const hoisteds: IRHoisted[] = new Array( n );
    const hoistedsToInline: IRHoisted[] = new Array( n );

    // console.log( allHoisteds.map( h => toHex( h.hoisted.hash ) ) );

    // filter out hoisted terms with single reference
    for( let i = 0; i < n; i++ )
    {
        const thisHoistedEntry = allHoisteds[i];
        if(
            thisHoistedEntry.nReferences === 1 &&
            thisHoistedEntry.hoisted.parent
        )
        {
            // inline hoisted with single reference
            hoistedsToInline[ b++ ] = thisHoistedEntry.hoisted;
        }
        else hoisteds[ a++ ] = thisHoistedEntry.hoisted;
    }

    // drop unused space
    hoisteds.length = a;
    hoistedsToInline.length = b;

    // very bad but works
    const originalHoistedHashes = hoisteds.map( hoisted => hoisted.hash.slice() );

    // console.log( hoisteds.map( h => toHex( h.hash ) ) );
    // inline single references from last to first
    let hoisted : IRHoisted;
    for( let i = hoistedsToInline.length - 1; i >= 0; i-- )
    {
        hoisted = hoistedsToInline[i] as IRHoisted;
        _modifyChildFromTo(
            hoisted.parent as IRTerm,
            hoisted,
            hoisted.hoisted
        );
    }

    let root: IRTerm = term;
    while( root.parent !== undefined ) root = root.parent;

    // adds the actual terms
    for( let i = hoisteds.length - 1; i >= 0; i-- )
    {
        root = new IRApp(
            new IRFunc(
                1,
                root
            ),
            hoisteds[i].hoisted.clone()
        )
    }

    // unwrap;
    if( root instanceof IRHoisted )
    {
        root = handleHoistedAndReturnRoot( root.hoisted.clone() );
        return root;
    }

    function getIRVarForHoistedAtLevel( _hoisted: IRHoisted, level: number ): IRVar
    {
        let levelOfTerm = hoisteds.findIndex( sortedH => uint8ArrayEq( sortedH.hash, _hoisted.hash ) );
        if( levelOfTerm < 0 )
        {
            // try the original hashes
            // very bad but works
            levelOfTerm = originalHoistedHashes.findIndex( hash => uint8ArrayEq( hash, _hoisted.hash ) )
        }

        if( levelOfTerm < 0 )
        {
            // logJson( _hoisted );
            // console.log(
            //     hoisteds.map( h => toHex( h.hash ) )
            // );
            // logJson( hoisteds[ hoisteds.length - 1 ] );
            throw new PlutsIRError(
                `missing hoisted with hash ${toHex(_hoisted.hash)} between [\n\t${
                    hoisteds.map( h => toHex( h.hash ) )
                    .join(",\n\t")
                }\n]; can't replace with IRVar`
            );
        }
        return new IRVar( level - (levelOfTerm + 1) );
    }

    // console.log( hoisteds.map( h => toHex( h.hash ) ) );

    // start form root since we need to replace hoisted dependecies too
    const stack: { irTerm: IRTerm, dbn: number }[] = [{ irTerm: root, dbn: 0 }];
    while( stack.length > 0 )
    {
        const { irTerm, dbn }  = stack.pop() as { irTerm: IRTerm, dbn: number };
        if( irTerm instanceof IRHoisted )
        {
            const irvar = getIRVarForHoistedAtLevel( irTerm, dbn );
            if( irvar.dbn >= dbn )
            {
                throw new PlutsIRError(
                    `out of bound hoisted term; hash: ${toHex( irTerm.hash )}; var's DeBruijn: ${irvar.dbn} (starts from 0); tot hoisted in scope: ${dbn}`
                )
            }
            _modifyChildFromTo(
                irTerm.parent as IRTerm,
                irTerm,
                irvar
            );
            continue;
        }

        if( irTerm instanceof IRApp )
        {
            stack.push(
                { irTerm: irTerm.fn , dbn },
                { irTerm: irTerm.arg, dbn },
            );
            continue;
        }

        if( irTerm instanceof IRDelayed )
        {
            stack.push(
                { irTerm: irTerm.delayed, dbn }
            );
            continue;
        }

        if( irTerm instanceof IRForced )
        {
            stack.push(
                { irTerm: irTerm.forced, dbn }
            );
            continue;
        }

        if( irTerm instanceof IRFunc )
        {
            stack.push(
                { irTerm: irTerm.body, dbn: dbn + irTerm.arity }
            );
            continue;
        }

        if( irTerm instanceof IRLetted )
        {
            stack.push(
                { irTerm: irTerm.value, dbn }
            );
            continue;
        }
    }

    return root;
}

