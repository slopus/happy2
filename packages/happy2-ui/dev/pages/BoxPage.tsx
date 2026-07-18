import { Box } from "../../src/Box";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export function BoxPage() {
    return (
        <ComponentPage
            number="C-001"
            title="Box"
            summary="A neutral layout primitive whose geometry is completely controlled by props."
        >
            <section className="box-plans" aria-label="Box dimension specimens">
                <Specimen number="01.1" label="fixed dimensions" detail="240 × 120">
                    <div className="box-demo box-demo--fixed">
                        <DimensionRule label="240px" />
                        <Box width={240} height={120} className="blueprint-box">
                            <span>240 × 120</span>
                            <small>fixed</small>
                        </Box>
                    </div>
                </Specimen>
                <Specimen number="01.2" label="percentage width" detail="62.5% × 96">
                    <div className="box-demo box-demo--fluid">
                        <Box
                            width="62.5%"
                            height={96}
                            className="blueprint-box blueprint-box--light"
                        >
                            <span>62.5%</span>
                            <small>container-relative</small>
                        </Box>
                    </div>
                </Specimen>
                <Specimen number="01.3" label="nested geometry" detail="320 × 180">
                    <Box width={320} height={180} className="blueprint-box blueprint-box--frame">
                        <Box
                            width="50%"
                            height="50%"
                            className="blueprint-box blueprint-box--nested"
                        >
                            <span>50 × 50%</span>
                        </Box>
                    </Box>
                </Specimen>
            </section>
        </ComponentPage>
    );
}
