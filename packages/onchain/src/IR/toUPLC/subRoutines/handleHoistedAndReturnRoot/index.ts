import { toHex, uint8ArrayEq } from "@harmoniclabs/uint8array-utils";
import { IRApp } from "../../../IRNodes/IRApp";
import { IRDelayed } from "../../../IRNodes/IRDelayed";
import { IRForced } from "../../../IRNodes/IRForced";
import { IRFunc } from "../../../IRNodes/IRFunc";
import { getSortedHoistedSet, getHoistedTerms, IRHoisted } from "../../../IRNodes/IRHoisted";
import { IRLetted } from "../../../IRNodes/IRLetted";
import { IRVar } from "../../../IRNodes/IRVar";
import { IRTerm } from "../../../IRTerm";
import { _modifyChildFromTo } from "../../_internal/_modifyChildFromTo";
import { showIR } from "../../../utils/showIR";
import { markRecursiveHoistsAsForced } from "../markRecursiveHoistsAsForced";


export function handleHoistedAndReturnRoot( term: IRTerm ): IRTerm
{
    // unwrap;
    if( term instanceof IRHoisted )
    {
        // we know `handleHoistedAndReturnRoot` modifies the term
        // so we are probably ok not cloning here
        // top level hoisted terms should be handled in `compileIRToUPLC` anyway
        const theTerm = term.hoisted; // .clone()

        // we still need to remove this parent otherhiwe there will be an unknown hoisted to handle
        theTerm.parent = undefined;
        return handleHoistedAndReturnRoot(
            theTerm
        );
    }

    // TODO: should probably merge `markRecursiveHoistsAsForced` inside `getHoistedTerms` to iter once
    markRecursiveHoistsAsForced( term );
    const directHoisteds = getHoistedTerms( term );
    const allHoisteds = getSortedHoistedSet( directHoisteds );
    let n = allHoisteds.length;

    // evaluating constants
    if( n === 0 )
    {
        return term;
    }
    
    // nothing to do; shortcut.
    if( n === 0 ) return term;

    let a = 0;
    let b = 0;
    const toHoist: IRHoisted[] = new Array( n );
    const toInline: IRHoisted[] = new Array( n );

    // filter out hoisted terms with single reference
    for( let i = 0; i < n; i++ )
    {
        const thisHoistedEntry = allHoisteds[i];
        
        if( thisHoistedEntry.hoisted.meta.forceHoist === true )
        {
            toHoist[ a++ ] = thisHoistedEntry.hoisted;
            continue;
        }

        if(
            thisHoistedEntry.nReferences === 1 &&
            thisHoistedEntry.hoisted.parent
        )
        {
            // inline hoisted with single reference
            toInline[ b++ ] = thisHoistedEntry.hoisted;
        }
        else toHoist[ a++ ] = thisHoistedEntry.hoisted;
    }

    // drop unused space
    toHoist.length = a;
    toInline.length = b;
    const hoistedsToInlineHashes = toInline.map( h => h.hash );

    // console.log( "toHoist", toHoist.map( h => ({ ...showIR( h.hoisted ), hash: toHex( h.hash ) }) ) );
    // console.log( "toInline", toInline.map( h => ({ ...showIR( h.hoisted ), hash: toHex( h.hash ) }) ) );

    let root: IRTerm = term;
    while( root.parent !== undefined ) root = root.parent;

    function getIRVarForHoistedAtLevel( _hoistedHash: Uint8Array, level: number ): IRVar
    {
        let levelOfTerm = toHoist.findIndex( sortedH => uint8ArrayEq( sortedH.hash, _hoistedHash ) );
        if( levelOfTerm < 0 )
        {
            throw new Error(
                `missing hoisted with hash ${toHex(_hoistedHash)} between toHoist [\n\t${
                    toHoist.map( h => toHex( h.hash ) )
                    .join(",\n\t")
                }\n]; can't replace with IRVar`
            );
        }
        return new IRVar( level - (levelOfTerm + 1) );
    }

    // adds the actual terms
    // from last to first
    for( let i = toHoist.length - 1; i >= 0; i-- )
    {
        const thisHoisted = toHoist[i];
        root = new IRApp(
            new IRFunc(
                1,
                root
            ),
            thisHoisted.hoisted.clone()
        );
    }

    // replace hoisted references with variables
    const stack: { irTerm: IRTerm, dbn: number }[] = [{ irTerm: root, dbn: 0 }];
    while( stack.length > 0 )
    {
        const { irTerm, dbn }  = stack.pop() as { irTerm: IRTerm, dbn: number };

        const irTermHash = irTerm.hash;
        const isHoistedToinline = hoistedsToInlineHashes.some( h => uint8ArrayEq( h, irTermHash ) ); 
        if(
            // is hoiseted
            irTerm instanceof IRHoisted &&
            // is not one to be inlined
            !isHoistedToinline
        )
        {
            const irvar = getIRVarForHoistedAtLevel( irTermHash, dbn );
            if( irvar.dbn >= dbn )
            {
                throw new Error(
                    `out of bound hoisted term; hash: ${toHex( irTerm.hash )}; var's DeBruijn: ${irvar.dbn} (starts from 0); tot hoisted in scope: ${dbn}`
                )
            }

            // console.log(
            //     showIRText( irTerm.parent as IRTerm ),
            //     "\n\n",
            //     showIRText( irTerm ),
            // )
            _modifyChildFromTo(
                irTerm.parent as IRTerm,
                irTerm,
                irvar
            );
        
            Object.defineProperty(
                irTerm.meta, "handled", {
                    value: true,
                    writable: true,
                    enumerable: true,
                    configurable: true
                }
            );

            // don't push anything
            // because we just replaced with a variable
            // so we know there's not a tree to explore
            continue;
        }
        else if( irTerm instanceof IRHoisted )
        {
            if( !isHoistedToinline )
            {
                throw new Error(
                    "unexpected hoisted term found with hash: " + toHex( irTermHash ) +
                    "\n showIR of the term: " + JSON.stringify(
                        showIR( irTerm ),
                        undefined,
                        2
                    )
                )
            }
            
            const toInline = irTerm.hoisted;
            _modifyChildFromTo(
                irTerm.parent as IRTerm,
                irTerm,
                toInline
            );
            stack.push({ irTerm: toInline, dbn });
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
