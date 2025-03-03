import { toHex } from "@harmoniclabs/uint8array-utils";
import { logJson } from "../../../../utils/ts/ToJson";
import { IRApp } from "../../IRNodes/IRApp";
import { IRDelayed } from "../../IRNodes/IRDelayed";
import { IRForced } from "../../IRNodes/IRForced";
import { IRFunc } from "../../IRNodes/IRFunc";
import { IRLetted, getNormalizedLettedArgs } from "../../IRNodes/IRLetted";
import { IRVar } from "../../IRNodes/IRVar";
import { IRTerm } from "../../IRTerm";
import { handleLetted } from "../subRoutines/handleLetted/index";
import { _ir_apps } from "../../tree_utils/_ir_apps";
import { IRNative } from "../../IRNodes/IRNative";
import { showIR } from "../../utils/showIR";
import { compileIRToUPLC } from "../compileIRToUPLC";


describe("compileIRToUPLC", () => {

    describe("letted", () => {

        test("keeps scope", () => {

            let irTree: IRTerm = new IRForced(
                new IRDelayed(
                    new IRApp(
                        new IRFunc(1,
                            new IRLetted(
                                1,
                                new IRVar(0)
                            )
                        ),
                        new IRFunc( 1,
                            new IRLetted(
                                1,
                                new IRVar( 0 )
                            )
                        )
                    )
                )
            );

            handleLetted( irTree );

            expect(
                irTree.toJson()
            ).toEqual(
                new IRForced(
                    new IRDelayed(
                        new IRApp(
                            new IRFunc(1,
                                new IRVar(0)
                            ),
                            new IRFunc( 1,
                                new IRVar(0)
                            )
                        )
                    )
                ).toJson()
            );

        });

        test("same scope; different DeBruijn", () => {

            // we use `IRDelayed` because plain `IRVars`a re inlined
            const tree = new IRFunc(
                1,
                new IRApp(
                    new IRFunc(
                        2,
                        new IRLetted(
                            3,
                            new IRDelayed(
                                new IRVar(2)
                            )
                        )
                    ),
                    new IRLetted(
                        1,
                        new IRDelayed(
                            new IRVar(0)
                        )
                    )
                )
            );

            expect(
                (tree as any).body.fn.body.hash
            ).toEqual(
                (tree as any).body.arg.hash
            );

            handleLetted( tree )

            expect( tree.toJson() )
            .toEqual(
                new IRFunc(
                    1,
                    new IRApp(
                        new IRFunc(
                            1,
                            new IRApp(
                                new IRFunc(
                                    2,
                                    new IRVar( 2 )
                                ),
                                new IRVar( 0 )
                            )
                        ),
                        new IRDelayed(
                            new IRVar( 0 )
                        )
                    )
                ).toJson()
            );
 
        });

    });

});