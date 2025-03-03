import { IRError } from "../../IR/IRNodes/IRError";
import { Term } from "../Term";
import { TermType, ToPType } from "../type_system";

export function perror<T extends TermType>( type: T , msg: string | undefined = undefined, addInfos: object | undefined = undefined): Term<ToPType<T>>
{
    return new Term(
        type as any,
        _dbn => new IRError( msg, addInfos )
    )
}
