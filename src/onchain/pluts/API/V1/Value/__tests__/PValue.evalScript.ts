import { Term, TermInt } from "../../../..";
import { Machine } from "../../../../../CEK";
import { showUPLC } from "../../../../../UPLC/UPLCTerm";
import { UPLCConst } from "../../../../../UPLC/UPLCTerms/UPLCConst";
import { PInt, pmatch } from "../../../../PTypes";
import { PMaybe, addUtilityForType, pByteString, pInt, pPair, pfn, phoist, punsafeConvertType, toData } from "../../../../lib";
import { pList } from "../../../../lib/std/list/const";
import { bs, int } from "../../../../type_system/types";
import { PCurrencySymbol } from "../PCurrencySymbol";
import { PTokenName } from "../PTokenName";
import { PAssetsEntryT, PValue, PValueEntryT } from "../PValue";

const currSym = PCurrencySymbol.from( pByteString("ff".repeat(28)) );
const tn = PTokenName.from( pByteString("") );

const oneEntryValue = PValue.from( 
    pList( PValueEntryT )([
        pPair( PValueEntryT[1], PValueEntryT[2] )
        (
            currSym,
            pList( PAssetsEntryT )([
                pPair( PAssetsEntryT[1], PAssetsEntryT[2] )
                ( 
                    tn,
                    pInt(1_000_000)
                )
            ])
        )
    ])
);


describe("Machine.evalSimple( PValue )", () => {

    test("empty value constructed correctly", () => {
        expect(
            Machine.evalSimple(
                PValue.from( pList( PValueEntryT )([]) as any )
            ) instanceof UPLCConst
        ).toBe( true )
        
    });

    test("one entry value", () => {
        expect(
            Machine.evalSimple( oneEntryValue ) instanceof UPLCConst
        ).toBe( true )
    });
    
    test("one entry to data", () => {

        const { result } = Machine.eval(
            toData( PValue.type )( oneEntryValue )
        );

        expect(
            result instanceof UPLCConst
        ).toBe( true )

    });

    test("value in maybe", () => {

        const { result } = Machine.eval(
            PMaybe( PValue.type ).Just({ val: oneEntryValue })
        );
        
        expect(
            result instanceof UPLCConst
        ).toBe( true )

    })

});

const pvalueOf = phoist(
    pfn([
        PValue.type,
        bs,
        bs
    ],  int)
    (( value, currSym, tokenName ) =>
        pmatch(
            value.find( entry => 
                entry.fst.eq( currSym )
            )
        )
        .onJust( _ => _.extract("val").in( ({ val: policyEntry }) => {

            return pmatch(
                policyEntry.snd.find( entry =>
                    entry.fst.eq( tokenName )
                )
            )
            .onJust( _ => _.extract("val").in(({ val: entry }) =>
                entry.snd 
            ))
            .onNothing( _ => pInt( 0 ) )
        }))
        .onNothing( _ => pInt( 0 ) )
    )
);

describe("pvalueOf", () => {

    test("non exsistent coin", () => {

        const expected = Machine.evalSimple( pInt(0) );
        const received = Machine.evalSimple( pvalueOf.$( oneEntryValue ).$("").$("") );

        expect(
            received
        ).toEqual(
            expected
        );

    });

    test("policy present but not token", () => {

        const expected = Machine.evalSimple( pInt(0) );
        const received = Machine.evalSimple( pvalueOf.$( oneEntryValue ).$( currSym as any ).$("") );

        expect(
            received
        ).toEqual(
            expected
        );

    });

    test.only("policy present but not token", () => {

        const term = pvalueOf.$( oneEntryValue ).$( currSym as any ).$( tn as any );

        console.log(
            showUPLC(
                term.toUPLC(0)
            )
        );
        const expected = Machine.evalSimple( pInt(0) );
        const received = Machine.evalSimple( term );

        console.log( received );
        console.log(
            showUPLC(
                term.toUPLC(0)
            )
        );

        expect(
            received
        ).toEqual(
            expected
        );

    });

})