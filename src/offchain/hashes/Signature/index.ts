import CborObj from "../../../cbor/CborObj";
import { CanBeCborString } from "../../../cbor/CborString";
import JsRuntime from "../../../utils/JsRuntime";
import Hash from "../Hash";

export default class Signature extends Hash
{
    constructor( bs: string | Buffer | Signature  )
    {
        super( bs instanceof Signature ? bs.asBytes : bs );

        JsRuntime.assert(
            this._bytes.length === 64,
            "'Signature' must be an hash of length 64"
        );
    }

    clone(): Signature
    {
        return new Signature( this.asBytes )
    }

    valueOf(): string
    {
        return this.asString;
    }

    static fromCbor(cStr: CanBeCborString): Signature
    {
        return new Signature( Hash.fromCbor( cStr ).asBytes )
    }
    static fromCborObj( cObj: CborObj ): Signature
    {
        return new Signature( Hash.fromCborObj( cObj ).asBytes )
    }
}