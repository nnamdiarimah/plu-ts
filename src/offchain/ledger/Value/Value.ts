import JsRuntime from "../../../utils/JsRuntime";
import ObjectUtils from "../../../utils/ObjectUtils";

import { Cbor } from "../../../cbor/Cbor";
import { CborObj } from "../../../cbor/CborObj";
import { CborBytes } from "../../../cbor/CborObj/CborBytes";
import { CborMap, CborMapEntry } from "../../../cbor/CborObj/CborMap";
import { CborNegInt } from "../../../cbor/CborObj/CborNegInt";
import { CborUInt } from "../../../cbor/CborObj/CborUInt";
import { CborString, CanBeCborString, forceCborString } from "../../../cbor/CborString";
import { ToCbor } from "../../../cbor/interfaces/CBORSerializable";
import { InvalidCborFormatError } from "../../../errors/InvalidCborFormatError";
import { DataB } from "../../../types/Data/DataB";
import { DataI } from "../../../types/Data/DataI";
import { DataMap } from "../../../types/Data/DataMap";
import { DataPair } from "../../../types/Data/DataPair";
import { ToData } from "../../../types/Data/toData/interface";
import { Cloneable } from "../../../types/interfaces/Cloneable";
import { ToJson } from "../../../utils/ts/ToJson";
import { Hash28 } from "../../hashes/Hash28/Hash28";
import { isIValue, addIValues, subIValues, IValue, cloneIValue, IValueToJson, getEmptyNameQty, getNameQty } from "./IValue";
import { CborArray } from "../../../cbor/CborObj/CborArray";
import { ByteString } from "../../../types/HexString/ByteString";
import { IValueAssets } from "./IValue";
import { hex } from "../../../types/HexString";
import { fromAscii, fromHex, fromUtf8, isUint8Array, lexCompare, toAscii, toHex } from "@harmoniclabs/uint8array-utils";
import { Hash32 } from "../../hashes";

const enum Ord {
    LT = -1,
    EQ = 0,
    GT = 1
}

export type ValueUnitEntry = {
    unit: string;
    quantity: bigint | number | string ;
};

export type ValueUnits = ValueUnitEntry[]

export type ValueUnitEntryBI = {
    unit: string;
    quantity: bigint;
};

export type ValueUnitsBI = ValueUnitEntryBI[]

export class Value
    implements ToCbor, Cloneable<Value>, ToData, ToJson
{
    readonly map!: IValue

    *[Symbol.iterator]()
    {
        for( const { policy, assets } of this.map )
        {
            yield { policy: policy.toString() as hex, assets: assets as IValueAssets };
        }
        return;
    }

    constructor( map: IValue )
    {
        JsRuntime.assert(
            isIValue( map ),
            "invalid value interface passed to contruct a 'value' instance"
        );

        map.forEach( entry => {

            const assets = entry.assets;

            assets.forEach( a => Object.freeze( a ) );
            Object.freeze( entry.policy );
        });

        // value MUST have an ada entry
        if( !map.some( entry => entry.policy === "" ) )
        {
            map.unshift({
                policy: "",
                assets: [
                    {
                        name: new Uint8Array([]),
                        quantity: 0
                    }
                ]
            });
        }

        map.sort((a,b) => {
            if( a.policy === "" )
            {
                if( b.policy === "" ) return Ord.EQ;
                return Ord.LT;
            };
            if( b.policy === "" )
            {
                return Ord.GT;
            }
            return lexCompare( a.policy.toBuffer(), b.policy.toBuffer() );
        });

        ObjectUtils.defineReadOnlyProperty(
            this,
            "map",
            Object.freeze( map )
        );

        Object.defineProperty(
            this, "lovelaces",
            {
                get: (): bigint => BigInt(
                    getEmptyNameQty(
                        this.map
                        .find( ({ policy }) => policy === "" )
                        ?.assets
                    ) ?? 0 
                ),
                set: () => {},
                enumerable: true,
                configurable: false
            }
        );
    }

    readonly lovelaces!: bigint;

    get( policy: Hash28 | Uint8Array | string , assetName: Uint8Array | string ): bigint
    {
        if( typeof policy === "string" )
        {
            if( policy === "" ) return this.lovelaces;
            policy = new Hash28( policy );
        }

        const policyStr = policy instanceof Hash28 ? policy.toString() : toHex( policy );

        if( isUint8Array( assetName ) )
        assetName = toAscii( assetName );

        return BigInt(
            (
                this.map
                .find( ({ policy }) => policy.toString() === policyStr ) as any
            )?.assets[assetName] 
            ?? 0 
        );
    }

    toUnits(): ValueUnitsBI
    {
        return this.map.flatMap(({ policy, assets }) => {
            if( policy === "" )
            {
                return { unit: 'lovelace', quantity: BigInt( getEmptyNameQty( assets ) ?? 0 ) }
            }
            return assets.map(({ name: assetName }) => ({
                    unit: `${policy.toString()}${toHex( assetName )}`,
                    quantity: BigInt( getNameQty( assets, assetName ) ?? 0 )
                })
            );
        });
    }

    static fromUnits( units: ValueUnits ): Value
    {
        return units.map(({ unit, quantity }): Value => {

            if( unit.length === 0 || unit === "lovelace" )
            {
                return Value.lovelaces( BigInt( quantity ) );
            }

            const policy = new Hash28( unit.slice( 0, 56 ) );

            const assetName = fromHex( unit.slice( 56 ) );

            return new Value([
                {
                    policy,
                    assets: [
                        {
                            name: assetName,
                            quantity: BigInt(quantity)
                        }
                    ]
                }
            ]);
        })
        .reduce( (a, b) => Value.add( a, b ) );
    }

    static get zero(): Value
    {
        return Value.lovelaces( 0 )
    }

    static isZero( v: Value ): boolean
    {
        return (
            v.map.length === 0 ||
            v.map.every(({ assets }) =>
                assets.every( ({ quantity }) =>
                    quantity === BigInt(0) 
                ) 
            )
        )
    }

    static isPositive( v: Value ): boolean
    {
        return v.map.every( ({ assets }) =>
            assets.every( ({ quantity }) => 
                quantity >= 0 
            )
        )
    }

    static isAdaOnly( v: Value ): boolean
    {
        return v.map.length === 1;
    }

    static lovelaces( n: number | bigint ): Value
    {
        return new Value([{
            policy: "",
            assets: [
                {
                    name: new Uint8Array([]),
                    quantity: typeof n === "number" ? Math.round( n ) : BigInt( n ) 
                }
            ]
        }]);
    }

    static add( a: Value, b: Value ): Value
    {
        return new Value( addIValues( a.map, b.map ) );
    }

    static sub( a: Value, b: Value ): Value
    {
        return new Value( subIValues( a.map, b.map ) );
    }

    clone(): Value
    {
        return new Value( cloneIValue(this.map ) )
    }

    toData(): DataMap<DataB,DataMap<DataB,DataI>>
    {
        return new DataMap<DataB,DataMap<DataB,DataI>>(
            this.map.map( ({ policy, assets }) =>
                new DataPair(
                    new DataB( new ByteString( policy === "" ? "" : policy.toBuffer() ) ),
                    new DataMap(
                        assets.map( ({ name: assetName }) =>
                            new DataPair(
                                new DataB(
                                    new ByteString( assetName )
                                ),
                                new DataI( getNameQty( assets, assetName ) ?? 0 )
                            )
                        )
                    )
                )
            )
        )
    }
    
    toCbor(): CborString
    {
        return Cbor.encode( this.toCborObj() );
    }
    toCborObj(): CborObj
    {
        if( Value.isAdaOnly( this ) ) return new CborUInt( this.lovelaces );

        const multiasset = new CborMap(
            this.map
            // only keep hash28
            .filter(({ policy }) => policy.toString().length === 56 )
            .map( entry => {
                const assets = entry.assets;
                const policy = entry.policy;
                return {
                    k: policy === "" ? new CborBytes( new Uint8Array(0) ) : policy.toCborObj(),
                    v: new CborMap(
                        assets.map( ({ name: assetName, quantity: amt }) => {
                            return {
                                k: new CborBytes( assetName.slice() ),
                                v: amt < 0 ? new CborNegInt( amt ) : new CborUInt( amt )
                            };
                        })
                    )
                };
            })
        );

        if( this.lovelaces === BigInt(0) ) return multiasset;

        return new CborArray([
            new CborUInt( this.lovelaces ),
            multiasset
        ]);
    }

    static fromCbor( cStr: CanBeCborString ): Value
    {
        return Value.fromCborObj( Cbor.parse( forceCborString( cStr ) ) )
    }
    static fromCborObj( cObj: CborObj ): Value
    {
        if(!(
            cObj instanceof CborArray   ||  // ada and assets
            cObj instanceof CborMap     ||  // only assets
            cObj instanceof CborUInt        // only ada
        ))
        throw new InvalidCborFormatError("Value");

        if( cObj instanceof CborUInt )
        return Value.lovelaces( cObj.num );

        let cborMap: CborMapEntry[];
        let valueMap: IValue;

        if( cObj instanceof CborArray )
        {
            if(!(
                cObj.array[0] instanceof CborUInt &&
                cObj.array[1] instanceof CborMap
            ))
            throw new InvalidCborFormatError("Value");

            cborMap = cObj.array[1].map;
            valueMap = new Array( cborMap.length + 1 );

            valueMap[0] = {
                policy: "",
                assets: [
                    {
                        name: new Uint8Array([]),
                        quantity: cObj.array[0].num
                    }
                ]
            };
        }
        else
        {
            cborMap = cObj.map;
            valueMap = new Array( cborMap.length + 1 );

            valueMap[0] = {
                policy: "",
                assets: [
                    {
                        name: new Uint8Array([]),
                        quantity: BigInt( 0 )
                    }
                ]
            };
        }
        
        const n = cborMap.length;

        for( let i = 0; i < n; i++ )
        {
            const { k , v } = cborMap[i];

            if(!( k instanceof CborBytes ))
            throw new InvalidCborFormatError("Value");

            const policy = k.buffer.length === 0 ? "" : new Hash28( k.buffer )

            if(!( v instanceof CborMap ))
            throw new InvalidCborFormatError("Value");

            const assetsMap = v.map;
            const assetsMapLen = v.map.length;

            const assets: IValueAssets = [];

            for( let j = 0 ; j < assetsMapLen; j++ )
            {
                const { k, v } = assetsMap[j];
                if(!( k instanceof CborBytes ))
                throw new InvalidCborFormatError("Value");

                if(!( v instanceof CborNegInt || v instanceof CborUInt ))
                throw new InvalidCborFormatError("Value");

                assets.push({
                    name: k.buffer,
                    quantity: v.num
                });
            }

            valueMap[i + 1] = {
                policy: policy as any,
                assets
            };
        }

        return new Value(valueMap);
    }

    toJson()
    {
        return IValueToJson( this.map );
    }
}