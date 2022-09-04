import BasePlutsError from "../../../errors/BasePlutsError";
import ObjectUtils from "../../../utils/ObjectUtils";
import { NoInfer } from "../../../utils/ts";
import { CurriedFn, curry } from "../../../utils/ts/combinators";
import Application from "../../UPLC/UPLCTerms/Application";
import Delay from "../../UPLC/UPLCTerms/Delay";
import ErrorUPLC from "../../UPLC/UPLCTerms/ErrorUPLC";
import Force from "../../UPLC/UPLCTerms/Force";
import Lambda from "../../UPLC/UPLCTerms/Lambda";
import UPLCVar from "../../UPLC/UPLCTerms/UPLCVar";
import PType from "../PType";
import PDelayed from "../PTypes/PDelayed";
import PLam, { TermFn } from "../PTypes/PFn/PLam";
import Type, { FromPType, PrimType, ToPType, ToPTypeArr, ToTermArrNonEmpty, Type as Ty } from "../Term/Type";
import Term from "../Term";
import JsRuntime from "../../../utils/JsRuntime";
import { isDelayedType, isLambdaType, typeExtends } from "../Term/Type/utils";
import Debug from "../../../utils/Debug";


export function papp<Input extends PType, Output extends PType >( a: Term<PLam<Input,Output>>, b: Term<Input> ): Term<Output>
{
    let lambdaType: Ty = a.type;

    if(!( isLambdaType( lambdaType ) )) throw JsRuntime.makeNotSupposedToHappenError(
        "a term not representing a Lambda (aka. Type.Lambda) was passed to an application"
    );

    JsRuntime.assert(
        typeExtends( b.type, lambdaType[ 1 ] ),
        "while applying 'Lambda'; unexpected type of input; expected type was: \"" + lambdaType[1] +
        "\"; received input was of type: \"" + b.type + "\""
    );

    Debug.log(
        "\nApplying Term of Type: " + lambdaType +
        "\nto Term of Type: " + b.type
    )

    return new Term(
        lambdaType[ 2 ] as FromPType<Output>,
        dbn => {
            return new Application(
                a.toUPLC( dbn ),
                b.toUPLC( dbn )
            )
        }
    );
}

export function plam<A extends Ty, B extends Ty >( inputType: A, outputType: B )
    : ( termFunc : ( input: Term<ToPType<A>> ) => Term<ToPType<B>> ) => TermFn<[ToPType<A>], ToPType<B>>
{
    return ( termFunc: ( input: Term<ToPType<A>> ) => Term<ToPType<B>> ): TermFn<[ToPType<A>],ToPType<B>> =>
    {
        const lambdaTerm  = new Term<PLam<ToPType<A>,ToPType<B>>>(
            Type.Lambda( inputType, outputType ),
            dbn => {
                const thisLambdaPtr = dbn + BigInt( 1 );

                const boundVar = new Term<ToPType<A>>(
                    inputType as any,
                    dbnAccessLevel => new UPLCVar( dbnAccessLevel - thisLambdaPtr )
                );
                
                // here the debruijn level is incremented
                return new Lambda( termFunc( boundVar ).toUPLC( thisLambdaPtr ) );
            }
        );
    
        // allows ```lambdaTerm.$( input )``` syntax
        // rather than ```papp( outCtor )( lambdaTerm, input )```
        // preserving Term Type
        return ObjectUtils.defineReadOnlyProperty(
            lambdaTerm,
            "$",
            ( input: Term<ToPType<A>> ) => papp( lambdaTerm, input )
        );
    }   
}

type MapTermOver< PTypes extends PType[] > =
    PTypes extends [] ? []:
    PTypes extends [ infer PInstance extends PType ] ? [ Term< PInstance > ] : 
    PTypes extends [ infer PInstance extends PType , ...infer PInstances extends PType[] ] ? 
        [ Term< PInstance > , ...MapTermOver< PInstances  > ] :
    never;

type Test0 = MapTermOver<[]>
type Test1 = MapTermOver<[ PType ]>
type Test2 = MapTermOver<[ PType, PType ]>
type Test3 = MapTermOver<[ PType, PType, PType ]>

type T  = MapTermOver<ToPTypeArr<[[PrimType.Unit], [PrimType.Int]]>>
/**
 * @fixme "ts-ignore"
// * /
export function pfn< Inputs extends [ Ty, ...Ty[] ], Output extends Ty >( inputs: Inputs, output: Output )
{
    return ( termFunc: ( ...ins: ToTermArr<Inputs> ) => Term<ToPType<Output>> )
        : TermFn<ToPTypeArrNonEmpty<Inputs>,ToPType<Output>> =>
    {
        if( termFunc.length === 0 ) throw new BasePlutsError( "unsupported '(void) => any' type at Pluts level" );
        if( termFunc.length === 1 ) return plam( inputs[0], output )( termFunc as any ) as any;

        //@ts-ignore
        return plam( inputs[0] , Type.Fn( inputs.slice(1) as any, output ) )(
            //@ts-ignore
            ( input: Term< Head< Inputs > > ) =>
            {
                return pfn(
                    // @ts-ignore
                    // Argument of type 'Type[]' is not assignable to parameter of type '[Type, ...Type[]]'
                    // if we get here inputs has at least length 2
                    inputs.slice(1),
                    output
                )( 
                    curryFirst(
                        /*
                        Argument of type '(fstInput: Term<Head<Inputs>>, ...ins: MapTermOver<Tail<Inputs>>) => Term<Output>'
                        is not assignable to parameter of type '(arg1: any, ...args: any[]) => Term<Output>'.
                            Types of parameters 'ins' and 'args' are incompatible.
                                Type 'any[]' is not assignable to type 'MapTermOver<Tail<Inputs>>'

                        basically typescript desn't recognizes 'MapTermOver<Tail<Inputs>>' to be an array of types (which is)
                        * /
                        //@ts-ignore
                        termFunc
                    )( input )
                )
            }

                
        );
    }
}
//*/

// type PFn<Inputs extends [ PType, ...PType[] ], Output extends PType > = 
type PFnFromTypes<Ins extends [ Ty, ...Ty[] ], Out extends Ty> =
    Ins extends [ infer T extends Ty ] ?
        PLam<ToPType<T>, ToPType<Out>> :
    Ins extends [ infer T extends Ty, ...infer RestTs extends [ Ty, ...Ty[] ] ] ?
        PLam<ToPType<T>, PFnFromTypes<RestTs, Out>>:
    never

// type PFnTest1 = PFnFromTypes<[[PrimType.Bool]], [PrimType.Bool]>

type TermFnFromTypes<Ins extends [ Ty, ...Ty[] ], Out extends Ty> =
    Ins extends [ infer T extends Ty ] ? Term<PLam<ToPType<T>, ToPType<Out>>> & { $: ( input: Term<ToPType<T>> ) => Term<ToPType<Out>> } :
    Ins extends [ infer T extends Ty, ...infer RestIns extends [ Ty, ...Ty[] ] ] ?
        Term<PLam<ToPType<T>,PFnFromTypes<RestIns, Out>>>
        & { $: ( input: Term<ToPType<T>> ) => TermFnFromTypes< RestIns, Out > } :
    never

type TsTermFunctionArgs<InputsTypes extends [ Ty, ...Ty[] ]> =
    InputsTypes extends [] ? never :
    InputsTypes extends [ infer T extends Ty ] ? [ a: Term<ToPType<T>> ] :
    InputsTypes extends [ infer T1 extends Ty, infer T2 extends Ty ] ? [ a: Term<ToPType<T1>>, b: Term<ToPType<T2>> ] :
    InputsTypes extends [ infer T extends Ty, ...infer RestTs extends [ Ty, ...Ty[] ] ] ? [ a: Term<ToPType<T>>, ...bs: TsTermFunctionArgs<RestTs> ] :
    never;

// type TsTermFunctionReturnT<OutputType extends Ty> = Term<ToPType<OutputType>>;

type TsTermFunction<InputsTypes extends [ Ty, ...Ty[] ], OutputType extends Ty> = (...args: TsTermFunctionArgs<InputsTypes> ) => Term<ToPType<OutputType>>

export function pfn<InputsTypes extends [ Ty, ...Ty[] ], OutputType extends Ty>( inputsTypes: InputsTypes, outputType: OutputType )
    : ( termFunction: TsTermFunction<InputsTypes,OutputType> ) => 
        TermFnFromTypes< InputsTypes, OutputType>
{
    function plamNCurried(
        curriedFn:
            CurriedFn<
                ToTermArrNonEmpty<InputsTypes>,
                Term<ToPType<OutputType>>
            >,
        nMissingArgs: number
    ): TermFnFromTypes<InputsTypes, OutputType>
    {
        if( nMissingArgs === 1 ) return plam( inputsTypes[ inputsTypes.length - 1 ], outputType )( curriedFn as any ) as any;

        const currentInputIndex = inputsTypes.length - nMissingArgs;

        return plam(
            inputsTypes[ currentInputIndex ],
            Type.Fn( inputsTypes.slice( currentInputIndex + 1 ) as any, outputType )
        )(
            ( someInput: Term<PType> ) => plamNCurried( curriedFn( someInput ) as any , nMissingArgs - 1 )
        ) as any;
    }

    return ( termFunction: ( ...args: ToTermArrNonEmpty<InputsTypes> ) => Term<ToPType<OutputType>> ) =>
    {
        if( termFunction.length <= 0 )
            throw new BasePlutsError("'(void) => any' cannot be translated to a Pluts function");

        JsRuntime.assert(
            termFunction.length === inputsTypes.length,
            "number of inputs of the function doesn't match the number of types specified for the input"
        );

        return plamNCurried(
            curry( termFunction ),
            termFunction.length
        );
    }
}
    

export function pdelay<PInstance extends PType>(toDelay: Term<PInstance>): Term<PDelayed<PInstance>>
{
    return new Term(
        Type.Delayed( toDelay.type ),
        (dbn) => {
            return new Delay(
                toDelay.toUPLC( dbn )
            );
        }
    );
}

export function pforce<PInstance extends PType>( toForce: Term<PDelayed<PInstance>> ): Term<PInstance>
{
    Debug.log( "foorcing type: " + toForce.type );

    if(!( isDelayedType( toForce.type ) ) ) throw new BasePlutsError(
        "cannot force a Term that is not Delayed first"
    );

    return new Term(
        toForce.type[ 1 ] as any,
        (dbn) => {
            const toForceUPLC = toForce.toUPLC( dbn );

            // if directly applying to Delay UPLC just remove the delay
            // example:
            // (force (delay (con int 11))) === (con int 11)
            if( toForceUPLC instanceof Delay )
            {
                return toForceUPLC.delayedTerm;
            }

            // any other case that evaluates to Delay
            return new Force(
                toForceUPLC
            );
        }
    );
}

export function plet<PExprResult extends PType, PVar extends PType = NoInfer<PType>, TermPVar extends Term<PVar> = NoInfer<Term<PVar>>>( varValue: TermPVar )
{
    return {
        in: ( expr: (value: TermPVar) => Term<PExprResult> ): Term<PExprResult> => {

            // only to extracts the type; never compiled
            const outType = expr( new Term(
                varValue.type,
                _dbn => new UPLCVar( 0 ) // mock variable
            ) as TermPVar ).type;

            return new Term(
                outType,
                dbn => new Application(
                    new Lambda(
                        expr( new Term(
                            varValue.type,
                            dbnExpr => new UPLCVar( dbn - ( dbnExpr + BigInt(1) ) ) // point to the lambda generated here
                        ) as TermPVar ).toUPLC( dbn )
                    ),
                    varValue.toUPLC( dbn )
                )
            );

            /*
            this causes to compile twice the term at compile-time

            one time here when checking
            and the second one at the actual compilation

            @fixme this should be handled at actual compile time with a similar process done for HoistedUPLC

            // multiRefsCase is the term returned above
            return hasMultipleRefsInTerm(
                    BigInt( -1 ), // var introduced in the term itself
                    multiRefsCase.toUPLC( 0 )
                ) ?
                multiRefsCase :
                // inline the value in the variable if not referenced more than once
                new Term(
                    dbn => expr( varValue ).toUPLC( dbn ),
                    new exprResT
                );
            */
        }
    };
}

export function perror<T extends Ty>( type: T ): Term<ToPType<T>>
{
    return new Term(
        type as any,
        _dbn => new ErrorUPLC
    );
}

