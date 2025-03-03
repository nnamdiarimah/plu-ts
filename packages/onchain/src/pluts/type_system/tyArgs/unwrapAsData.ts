import { PrimType, TermType } from "../types";

export function unwrapAsData<T extends TermType>( t: [ PrimType.AsData, T ] ): T
{
    while( t[0] === PrimType.AsData ) t = t[1] as any;
    return t as any;
}