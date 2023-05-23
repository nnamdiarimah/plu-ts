import { bs, int, lam, termTypeToString } from "../../..";
import { getFnTypes } from "../getFnTypes";

describe("getFnTypes", () => {

    test("lam( int, bs )", () => {

        console.log( getFnTypes( lam( int, bs ) ).map( termTypeToString ) );
        
    })
})