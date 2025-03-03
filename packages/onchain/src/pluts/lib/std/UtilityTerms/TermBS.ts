import { definePropertyIfNotPresent, defineReadOnlyProperty } from "@harmoniclabs/obj-utils"
import { PByteString, TermFn, PInt, PBool } from "../../../PTypes"
import { Term } from "../../../Term"
import { bs, int } from "../../../type_system/types"
import { flippedCons, pappendBs, pconsBs, peqBs, pgreaterBS, pgreaterEqBS, pindexBs, plengthBs, plessBs, plessEqBs, psliceBs } from "../../builtins/bs"
import { psub } from "../../builtins/int/psub"
import { pdecodeUtf8 } from "../../builtins/str"
import { PappArg } from "../../pappArg"
import { pfn } from "../../pfn"
import { phoist } from "../../phoist"
import { plet } from "../../plet"
import { TermBool } from "./TermBool"
import { TermInt } from "./TermInt"
import { TermStr } from "./TermStr"



export type TermBS = Term<PByteString> & {

    readonly length: TermInt
    
    readonly utf8Decoded: TermStr
    
    // pappendBs
    readonly concatTerm: TermFn<[PByteString], PByteString>
    readonly concat: ( other: PappArg<PByteString>) => TermBS

    // pconsBs
    readonly prependTerm: TermFn<[PInt], PByteString>
    readonly prepend: ( byte: PappArg<PInt> ) => TermBS

    // psliceBs
    readonly subByteStringTerm: TermFn<[PInt, PInt], PByteString>
    readonly subByteString: ( fromInclusive: PappArg<PInt>, ofLength: PappArg<PInt> ) => TermBS
    
    readonly sliceTerm: TermFn<[PInt, PInt], PByteString>
    readonly slice:     ( fromInclusive: PappArg<PInt>, toExclusive: PappArg<PInt> ) => TermBS
    
    // pindexBs
    readonly atTerm:    TermFn<[PInt], PInt>
    readonly at:        ( index: PappArg<PInt> ) => TermInt

    readonly eqTerm:    TermFn<[PByteString], PBool>
    readonly eq:        ( other: PappArg<PByteString> ) => TermBool

    readonly ltTerm:    TermFn<[PByteString], PBool>
    readonly lt:        ( other: PappArg<PByteString> ) => TermBool

    readonly ltEqTerm:  TermFn<[PByteString], PBool>
    readonly ltEq:      ( other: PappArg<PByteString> ) => TermBool

    readonly gtTerm:    TermFn<[PByteString], PBool>
    readonly gt:        ( other: PappArg<PByteString> ) => TermBool

    readonly gtEqTerm:  TermFn<[PByteString], PBool>
    readonly gtEq:      ( other: PappArg<PByteString> ) => TermBool

}

const subByteString = phoist(
    pfn([
        bs,
        int,
        int
    ],  bs)
    (( term, fromInclusive , ofLength ): TermBS =>
        psliceBs.$( fromInclusive ).$( ofLength ).$( term )
    )
)

const jsLikeSlice = phoist(
    pfn([
        bs,
        int,
        int
    ],  bs)
    (( term, fromInclusive , toExclusive ): TermBS =>
        psliceBs.$( fromInclusive ).$( psub.$( toExclusive ).$( fromInclusive ) ).$( term )
    )
);

const getterOnly = {
    set: () => {},
    configurable: false,
    enumerable: true
};

export function addPByteStringMethods( term: Term<PByteString> ): TermBS
{
    definePropertyIfNotPresent(
        term,
        "length",
        {
            get: () => plet( plengthBs.$( term ) ),
            ...getterOnly
        }
    );
    definePropertyIfNotPresent(
        term,
        "utf8Decoded",
        {
            get: () => plet( pdecodeUtf8.$( term ) ),
            ...getterOnly
        }
    );

    definePropertyIfNotPresent(
        term,
        "concatTerm",
        {
            get: () => pappendBs.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "concat",
        ( other: PappArg<PByteString>): TermBS => pappendBs.$( term ).$( other )
    );

    definePropertyIfNotPresent(
        term,
        "prependTerm",
        {
            get: () => flippedCons.$( term ), 
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "prepend",
        ( byte: PappArg<PInt>): TermBS => pconsBs.$( byte ).$( term )
    );

    definePropertyIfNotPresent(
        term,
        "subByteStringTerm",
        {
            get: () => subByteString.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "subByteString",
        ( fromInclusive: PappArg<PInt>, ofLength: PappArg<PInt> ): TermBS => psliceBs.$( fromInclusive ).$( ofLength ).$( term )
    );

    definePropertyIfNotPresent(
        term,
        "sliceTerm",
        {
            get: () => jsLikeSlice.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "slice",
        ( fromInclusive: PappArg<PInt>, toExclusive: PappArg<PInt> ): TermBS => jsLikeSlice.$( term ).$( fromInclusive ).$( toExclusive )
    );

    definePropertyIfNotPresent(
        term,
        "atTerm",
        {
            get: () => pindexBs.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "at",
        ( index: PappArg<PInt> ): TermInt => pindexBs.$( term ).$( index )
    );

    definePropertyIfNotPresent(
        term,
        "eqTerm",
        {
            get: () => peqBs.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "eq",
        ( other: PappArg<PByteString> ): TermBool => peqBs.$( term ).$( other )
    );

    definePropertyIfNotPresent(
        term,
        "ltTerm",
        {
            get: () => plessBs.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "lt",
        ( other: PappArg<PByteString> ): TermBool => plessBs.$( term ).$( other )
    );

    definePropertyIfNotPresent(
        term,
        "ltEqTerm",
        {
            get: () => plessEqBs.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "ltEq",
        ( other: PappArg<PByteString> ): TermBool => plessEqBs.$( term ).$( other )
    );

    definePropertyIfNotPresent(
        term,
        "gtTerm",
        {
            get: () => pgreaterBS.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "gt",
        ( other: PappArg<PByteString> ): TermBool => pgreaterBS.$( term ).$( other )
    );

    definePropertyIfNotPresent(
        term,
        "gtEqTerm",
        {
            get: () => pgreaterEqBS.$( term ),
            ...getterOnly
        }
    );
    defineReadOnlyProperty(
        term,
        "gtEq",
        ( other: PappArg<PByteString> ): TermBool => pgreaterEqBS.$( term ).$( other )
    );


    return term as any;
}