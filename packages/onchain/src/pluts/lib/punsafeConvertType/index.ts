import type { PType } from "../../PType";
import type { TermType } from "../../type_system/types";
import type { ToPType } from "../../type_system/ts-pluts-conversion";
import { type UtilityTermOf, addUtilityForType } from "../addUtilityForType";
import { isWellFormedType } from "../../type_system/kinds/isWellFormedType";
import { Term } from "../../Term";


export function punsafeConvertType<FromPInstance extends PType, ToTermType extends TermType>
( someTerm: Term<FromPInstance>, toType: ToTermType ): UtilityTermOf<ToPType<ToTermType>>
{
    if( !isWellFormedType( toType ) )
    throw new Error("`punsafeConvertType` called with invalid type");

    const converted = new Term(
        toType,
        someTerm.toIR,
        Boolean((someTerm as any).isConstant) // isConstant
    ) as any;

    Object.keys( someTerm ).forEach( k => {

        // do not overwrite `type` and `toUPLC` properties
        if( k === "type" || k === "toUPLC" || k === "toIR" ) return;
        
        Object.defineProperty(
            converted,
            k,
            Object.getOwnPropertyDescriptor(
                someTerm,
                k
            ) ?? {}
        )

    });

    return addUtilityForType( toType )( converted ) as any;
}