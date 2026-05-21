// 전역 디버깅 및 오류 화면 표시 시스템
window.addEventListener("error", (event) => {
    console.error("전역 에러 감지:", event.error);
    const dashboard = document.querySelector(".dashboard-main");
    if (dashboard) {
        const errorAlert = document.createElement("div");
        errorAlert.style.padding = "12px";
        errorAlert.style.margin = "12px 0";
        errorAlert.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
        errorAlert.style.border = "1px solid #ef4444";
        errorAlert.style.borderRadius = "6px";
        errorAlert.style.color = "#f87171";
        errorAlert.style.fontSize = "0.8rem";
        errorAlert.innerHTML = `
            <strong>스크립트 오류:</strong> ${event.message}<br>
            <small style="opacity: 0.8;">위치: ${event.filename} (Line: ${event.lineno})</small>
        `;
        dashboard.insertBefore(errorAlert, dashboard.firstChild);
    }
});

// Lucide 아이콘 초기화 안전하게 감싸기
function safeCreateIcons() {
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } catch (e) {
        console.error("Lucide 아이콘 로드 에러:", e);
    }
}

// 애플리케이션 초기화
window.addEventListener("load", () => {
    safeCreateIcons();
    initApp();
});

// 차트 객체 전역 관리
let cashFlowChart = null;
let costStructureChart = null;

// 평 <-> ㎡ 변환 상수
const PY_TO_M2 = 3.30578;

// KPI 카드 업데이트 헬퍼 함수
function updateKpi(id, html) {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = html;
    }
}

function initApp() {
    // 탭 전환 이벤트 바인딩
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
            
            btn.classList.add("active");
            const tabId = btn.getAttribute("data-tab");
            const targetPane = document.getElementById(tabId);
            if (targetPane) {
                targetPane.classList.add("active");
            }
        });
    });

    // 면적 및 토지비 실시간 계산 이벤트
    const landAreaPy = document.getElementById("landAreaPy");
    const landAreaM2 = document.getElementById("landAreaM2");
    
    // 상품별 면적 인풋
    const salesAreaApt = document.getElementById("salesArea_apt");
    const salesAreaOff = document.getElementById("salesArea_off");
    const salesAreaRtl = document.getElementById("salesArea_rtl");
    const salesAreaClt = document.getElementById("salesArea_clt");
    
    const gfaPy = document.getElementById("gfaPy");
    const gfaM2 = document.getElementById("gfaM2");
    const landPricePy = document.getElementById("landPricePy");
    const landPriceTotal = document.getElementById("landPriceTotal");

    function updateAreas() {
        if (!landAreaPy || !landAreaM2 || !gfaPy || !gfaM2 || !landPricePy || !landPriceTotal) return;

        const landPy = parseFloat(landAreaPy.value) || 0;
        landAreaM2.value = (landPy * PY_TO_M2).toFixed(1);

        // 상품별 분양면적 합산하여 총 연면적(분양면적 합계) 자동 도출
        const areaApt = parseFloat(salesAreaApt.value) || 0;
        const areaOff = parseFloat(salesAreaOff.value) || 0;
        const areaRtl = parseFloat(salesAreaRtl.value) || 0;
        const areaClt = parseFloat(salesAreaClt.value) || 0;
        
        const totalSalesArea = areaApt + areaOff + areaRtl + areaClt;
        gfaPy.value = totalSalesArea.toFixed(1);
        gfaM2.value = (totalSalesArea * PY_TO_M2).toFixed(1);

        const pricePy = parseFloat(landPricePy.value) || 0;
        // 평당 토지매입가(만원) * 토지면적(평) / 10000 = 총 토지비(억원)
        const totalLandPrice = (pricePy * landPy) / 10000;
        landPriceTotal.value = totalLandPrice.toFixed(1);
    }

    if (landAreaPy && salesAreaApt && salesAreaOff && salesAreaRtl && salesAreaClt && landPricePy) {
        [landAreaPy, salesAreaApt, salesAreaOff, salesAreaRtl, salesAreaClt, landPricePy].forEach(input => {
            input.addEventListener("input", updateAreas);
        });
    }

    // 최초 갱신
    updateAreas();

    // 분석 실행 버튼 바인딩
    const runBtn = document.getElementById("runSimBtn");
    if (runBtn) {
        runBtn.addEventListener("click", () => {
            runSimulation();
        });
    }

    // 전체 펼치기/접기 버튼 바인딩
    const toggleAllBtn = document.getElementById("toggleAllRowsBtn");
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener("click", () => {
            const categories = document.querySelectorAll(".category-row");
            const children = document.querySelectorAll(".child-row");
            
            // 하나라도 닫혀있으면 전체 펼치기, 모두 열려있으면 접기
            const isAnyCollapsed = Array.from(categories).some(cat => cat.classList.contains("collapsed"));
            
            categories.forEach(cat => {
                if (isAnyCollapsed) {
                    cat.classList.remove("collapsed");
                } else {
                    cat.classList.add("collapsed");
                }
            });

            children.forEach(child => {
                if (isAnyCollapsed) {
                    child.classList.remove("collapsed");
                } else {
                    child.classList.add("collapsed");
                }
            });
        });
    }

    // 실무 예제 로딩 버튼 바인딩
    const loadVitaminBtn = document.getElementById("loadVitaminBtn");
    if (loadVitaminBtn) {
        loadVitaminBtn.addEventListener("click", () => {
            loadExampleData("vitamin");
        });
    }

    const loadInsadongBtn = document.getElementById("loadInsadongBtn");
    if (loadInsadongBtn) {
        loadInsadongBtn.addEventListener("click", () => {
            loadExampleData("insadong");
        });
    }

    // 페이지 로드 시 최초 1회 실행
    runSimulation();
}

// S-Curve 누적 공정률 계산 함수
function getSCurveProgress(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return 3 * Math.pow(x, 2) - 2 * Math.pow(x, 3);
}

// Newton-Raphson 법을 활용한 IRR 계산기
function calculateIRR(cashFlows) {
    let hasPos = false;
    let hasNeg = false;
    cashFlows.forEach(cf => {
        if (cf.val > 0.001) hasPos = true;
        if (cf.val < -0.001) hasNeg = true;
    });
    
    if (!hasPos || !hasNeg) return null;

    let r = 0.1 / 12;
    const maxIter = 150;
    const tol = 1e-7;

    for (let i = 0; i < maxIter; i++) {
        let f = 0;
        let df = 0;
        for (let j = 0; j < cashFlows.length; j++) {
            const { t, val } = cashFlows[j];
            const discount = Math.pow(1 + r, t);
            f += val / discount;
            df += (-t * val) / (discount * (1 + r));
        }

        if (Math.abs(df) < 1e-12) break;

        let rNext = r - f / df;
        if (Math.abs(rNext - r) < tol) {
            const annualIrr = Math.pow(1 + rNext, 12) - 1;
            if (annualIrr < -0.99 || annualIrr > 15.0) return null;
            return annualIrr * 100;
        }
        r = rNext;
    }
    return null;
}

// NPV 계산기 (월복리 할인법)
function calculateNPV(cashFlows, annualDiscountRate) {
    const monthlyRate = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
    let sum = 0;
    cashFlows.forEach(cf => {
        sum += cf.val / Math.pow(1 + monthlyRate, cf.t);
    });
    return sum;
}

// 시뮬레이션 메인 함수
function runSimulation() {
    try {
        const getValue = (id, def = 0) => {
            const el = document.getElementById(id);
            return el ? (parseFloat(el.value) || def) : def;
        };

        const getStrValue = (id, def = "") => {
            const el = document.getElementById(id);
            return el ? el.value : def;
        };

        const projectName = getStrValue("projectName", "개발사업");
        const displayProj = document.getElementById("displayProjectName");
        if (displayProj) displayProj.innerText = `${projectName} 대시보드`;

        // 상품 용도 수정된 이름 수집
        const name_apt = getStrValue("name_apt", "공동주택");
        const name_off = getStrValue("name_off", "업무시설");
        const name_rtl = getStrValue("name_rtl", "근린생활시설");
        const name_clt = getStrValue("name_clt", "문화시설");

        // 1. 모든 세부 입력 변수 수집
        const inputs = {
            duration: parseInt(getValue("duration", 36)),
            pfTiming: parseInt(getValue("pfTiming", 10)),
            landArea: getValue("landAreaPy", 0),

            // 상품 이름
            name_apt, name_off, name_rtl, name_clt,

            // [매출 상품별 세분화]
            salesArea_apt: getValue("salesArea_apt", 0),
            price_apt: getValue("price_apt", 0),
            start_apt: parseInt(getValue("start_apt", 15)),
            rate_apt: getValue("rate_apt", 100),

            salesArea_off: getValue("salesArea_off", 0),
            price_off: getValue("price_off", 0),
            start_off: parseInt(getValue("start_off", 15)),
            rate_off: getValue("rate_off", 100),

            salesArea_rtl: getValue("salesArea_rtl", 0),
            price_rtl: getValue("price_rtl", 0),
            start_rtl: parseInt(getValue("start_rtl", 20)),
            rate_rtl: getValue("rate_rtl", 100),

            salesArea_clt: getValue("salesArea_clt", 0),
            price_clt: getValue("price_clt", 0),
            start_clt: parseInt(getValue("start_clt", 24)),
            rate_clt: getValue("rate_clt", 100),

            // 토지비 관련
            landPricePyVal: getValue("landPricePy", 0),
            landEviction: getValue("landEviction", 0),
            landCommission: getValue("landCommission", 0),
            landAcquisitionTax: getValue("landAcquisitionTax", 0) / 100,
            landOtherRights: getValue("landOtherRights", 0),

            // 직접공사비
            constructionCostPy: getValue("constructionCostPy", 0),
            demolitionCost: getValue("demolitionCost", 0),
            constructionContingency: getValue("constructionContingency", 0),

            // 간접공사비
            designCostPy: getValue("designCostPy", 0),
            supervisionCostPy: getValue("supervisionCostPy", 0),
            inflowCostPy: getValue("inflowCostPy", 0),
            surveyCost: getValue("surveyCost", 0),
            permissionCost: getValue("permissionCost", 0),
            artInstallation: getValue("artInstallation", 0),

            // 분양관련비
            mhRent: getValue("mhRent", 0),
            mhBuild: getValue("mhBuild", 0),
            mhOperation: getValue("mhOperation", 0),
            guaranteeFee: getValue("guaranteeFee", 0),
            loanGuaranteeFee: getValue("loanGuaranteeFee", 0),
            adCost: getValue("adCost", 0),
            leaseAgencyFee: getValue("leaseAgencyFee", 0),

            // 용역비/관리비
            trustFee: getValue("trustFee", 0),
            generalAgencyFee: getValue("generalAgencyFee", 0),
            appraisalFee: getValue("appraisalFee", 0),
            lenderLegalFee: getValue("lenderLegalFee", 0),
            devLegalFee: getValue("devLegalFee", 0),
            pmPrePf: getValue("pmPrePf", 0),
            pmPostPf: getValue("pmPostPf", 0),
            siteManagement: getValue("siteManagement", 0),
            cashManageFee: getValue("cashManageFee", 0),
            assetManageFee: getValue("assetManageFee", 0),
            auditPreFee: getValue("auditPreFee", 0),
            insuranceFee: getValue("insuranceFee", 0),
            bookkeepFee: getValue("bookkeepFee", 0),
            auditPostFee: getValue("auditPostFee", 0),
            indirectContingency: getValue("indirectContingency", 0),

            // 제세공과
            regTaxes: getValue("regTaxes", 0),
            infraCharge: getValue("infraCharge", 0),
            schoolCharge: getValue("schoolCharge", 0),
            licenceTax: getValue("licenceTax", 0),
            miscCharge: getValue("miscCharge", 0),
            holdingTax: getValue("holdingTax", 0),
            cityPlanTax: getValue("cityPlanTax", 0),

            // 금융 구조
            equity: getValue("equity", 0),
            blAmount: getValue("blAmount", 0),
            blFee: getValue("blFee", 0) / 100,
            blInterest: getValue("blInterest", 0) / 100,

            // 본 PF 조건
            pfTrA: getValue("pfTrA", 0),
            pfTrB: getValue("pfTrB", 0),
            pfTrAInterest: getValue("pfTrAInterest", 0) / 100,
            pfTrBInterest: getValue("pfTrBInterest", 0) / 100,
            pfTrAFee: getValue("pfTrAFee", 0) / 100,
            pfTrBFee: getValue("pfTrBFee", 0) / 100,
            pfArrangeFee: getValue("pfArrangeFee", 0) / 100,
            fiAdvisoryFee: getValue("fiAdvisoryFee", 0),
            absCosts: getValue("absCosts", 0),
            undrawnFee: getValue("undrawnFee", 0) / 100,
            freeInterestHousing: getValue("freeInterestHousing", 0) / 100,
            freeInterestRetail: getValue("freeInterestRetail", 0) / 100,

            // Capital Call 금리 및 할인율
            capCallInterest: getValue("capCallInterest", 0) / 100,
            discountRate: getValue("discountRate", 6.0) / 100
        };

        // 2. 비즈니스 로직 계산 패키지 실행
        const simResult = calculateFullCF(inputs);

        // 3. 인쇄 전용 '사업 가정 사항(Assumptions)' 세부 시점 및 정보 바인딩
        const setPText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = text;
        };

        const totalGfaPy = inputs.salesArea_apt + inputs.salesArea_off + inputs.salesArea_rtl + inputs.salesArea_clt;

        // [가정사항 1] 사업 개요 및 일정
        setPText("p_duration", `<strong>${inputs.duration}개월</strong>`);
        setPText("p_pfTiming", `<strong>${inputs.pfTiming}개월 차</strong>`);
        setPText("p_landArea", `${inputs.landArea.toFixed(1)}평 <span style="font-size:0.65rem; opacity:0.75;">(${(inputs.landArea * PY_TO_M2).toFixed(1)}㎡)</span>`);
        setPText("p_gfa", `${totalGfaPy.toFixed(1)}평 <span style="font-size:0.65rem; opacity:0.75;">(${(totalGfaPy * PY_TO_M2).toFixed(1)}㎡)</span>`);

        // [가정사항 2] 용도별 분양 스펙 및 명칭 바인딩
        setPText("p_lbl_apt", inputs.name_apt);
        setPText("p_lbl_off", inputs.name_off);
        setPText("p_lbl_rtl", inputs.name_rtl);
        setPText("p_lbl_clt", inputs.name_clt);

        // 면적이 0인 경우 Assumptions의 행 자체를 숨김 처리
        const trApt = document.getElementById("tr_p_apt");
        if (trApt) trApt.style.display = inputs.salesArea_apt > 0 ? "" : "none";
        
        const trOff = document.getElementById("tr_p_off");
        if (trOff) trOff.style.display = inputs.salesArea_off > 0 ? "" : "none";
        
        const trRtl = document.getElementById("tr_p_rtl");
        if (trRtl) trRtl.style.display = inputs.salesArea_rtl > 0 ? "" : "none";
        
        const trClt = document.getElementById("tr_p_clt");
        if (trClt) trClt.style.display = inputs.salesArea_clt > 0 ? "" : "none";

        // 스펙 텍스트 채우기
        if (inputs.salesArea_apt > 0) {
            setPText("p_area_apt", `${inputs.salesArea_apt.toFixed(1)}평`);
            setPText("p_price_apt", `${inputs.price_apt.toLocaleString()}만원`);
            setPText("p_start_apt", `<strong>${inputs.start_apt}M차</strong> <span style="font-size:0.65rem; opacity:0.75;">(10%/60%/30%)</span>`);
            setPText("p_rate_apt", `${inputs.rate_apt}%`);
        }
        if (inputs.salesArea_off > 0) {
            setPText("p_area_off", `${inputs.salesArea_off.toFixed(1)}평`);
            setPText("p_price_off", `${inputs.price_off.toLocaleString()}만원`);
            setPText("p_start_off", `<strong>${inputs.start_off}M차</strong> <span style="font-size:0.65rem; opacity:0.75;">(10%/60%/30%)</span>`);
            setPText("p_rate_off", `${inputs.rate_off}%`);
        }
        if (inputs.salesArea_rtl > 0) {
            setPText("p_area_rtl", `${inputs.salesArea_rtl.toFixed(1)}평`);
            setPText("p_price_rtl", `${inputs.price_rtl.toLocaleString()}만원`);
            setPText("p_start_rtl", `<strong>${inputs.start_rtl}M차</strong> <span style="font-size:0.65rem; opacity:0.75;">(10%/60%/30%)</span>`);
            setPText("p_rate_rtl", `${inputs.rate_rtl}%`);
        }
        if (inputs.salesArea_clt > 0) {
            setPText("p_area_clt", `${inputs.salesArea_clt.toFixed(1)}평`);
            setPText("p_price_clt", `${inputs.price_clt.toLocaleString()}만원`);
            setPText("p_start_clt", `<strong>${inputs.start_clt}M차</strong> <span style="font-size:0.65rem; opacity:0.75;">(10%/60%/30%)</span>`);
            setPText("p_rate_clt", `${inputs.rate_clt}%`);
        }

        // [가정사항 3] 핵심 사업비 변수 및 지출 시점 명시
        const landPriceTotal = (inputs.landPricePyVal * inputs.landArea) / 10000;
        setPText("p_constPy", `평당: ${inputs.constructionCostPy.toLocaleString()}만원<br><span style="font-size:0.65rem; opacity:0.75;">(시점: ${inputs.pfTiming + 1}~${inputs.duration}M S-Curve 기성)</span>`);
        setPText("p_landPrice", `원금: ${landPriceTotal.toFixed(1)}억원<br><span style="font-size:0.65rem; opacity:0.75;">(시점: 1M 일시 / 취득세 ${(inputs.landAcquisitionTax*100).toFixed(1)}%)</span>`);
        setPText("p_evicDemo", `명도: ${inputs.landEviction.toFixed(1)}억 (1~${inputs.pfTiming}M 분할)<br>철거: ${inputs.demolitionCost.toFixed(1)}억 (${Math.max(1, inputs.pfTiming-2)}~${inputs.pfTiming-1}M 분할)`);
        setPText("p_pmFee", `Pre-PF: 월 ${inputs.pmPrePf.toLocaleString()}만원<br>Post-PF: 월 ${inputs.pmPostPf.toLocaleString()}만원`);

        // [가정사항 4] 금융 및 PF 조달 구조와 이자 시점 명시
        setPText("p_eqBl", `Equity: ${inputs.equity.toFixed(1)}억원<br>브릿지론: ${inputs.blAmount.toFixed(1)}억원`);
        setPText("p_blRate", `수수료: ${(inputs.blFee*100).toFixed(1)}% / 금리: ${(inputs.blInterest*100).toFixed(1)}%<br><span style="font-size:0.65rem; opacity:0.75;">(시점: 1M 인출 $\\rightarrow$ ${inputs.pfTiming}M 본PF로 대환)</span>`);
        setPText("p_pfTrA", `한도: ${inputs.pfTrA.toFixed(1)}억원 / 금리: ${(inputs.pfTrAInterest*100).toFixed(1)}%<br><span style="font-size:0.65rem; opacity:0.75;">(수수료: 취급 ${(inputs.pfTrAFee*100).toFixed(1)}% / 주관 ${(inputs.pfArrangeFee*100).toFixed(1)}%)</span>`);
        setPText("p_capDiscount", `CapCall금리: 연 ${(inputs.capCallInterest*100).toFixed(1)}% (부족차 익월 복리)<br>NPV할인율: 연 ${(inputs.discountRate*100).toFixed(1)}% (월 복리할인)`);

        // 4. UI 주요 지표(KPI) 업데이트
        updateKpi("kpiGrossRevenue", `${simResult.totalRevenue.toFixed(1)} <span>억원</span>`);
        
        const salesRateFooter = document.getElementById("kpiSalesRate");
        if (salesRateFooter) {
            salesRateFooter.innerText = `가중평균 분양률: ${simResult.weightedSalesRate.toFixed(1)}% | 분양면적 합계: ${simResult.totalSalesArea.toFixed(1)}평`;
        }
        
        updateKpi("kpiTotalCost", `${simResult.totalProjectCost.toFixed(1)} <span>억원</span>`);
        
        const profitColorClass = simResult.netProfit >= 0 ? "text-sky" : "text-crimson";
        const profitKpi = document.getElementById("kpiNetProfit");
        if (profitKpi) {
            profitKpi.className = `kpi-card ${profitColorClass}`;
            const valEl = profitKpi.querySelector(".kpi-value");
            if (valEl) valEl.innerHTML = `${simResult.netProfit.toFixed(1)} <span>억원</span>`;
        }
        
        const roiFooter = document.getElementById("kpiRoi");
        if (roiFooter) {
            roiFooter.innerText = `수익률 (ROI): ${simResult.roi.toFixed(1)}% | 손익분기 평균분양률: ${simResult.bepSalesRate.toFixed(1)}%`;
        }

        updateKpi("kpiCapitalCall", `${simResult.maxCapitalCall.toFixed(1)} <span>억원</span>`);
        
        const capCallFooter = document.getElementById("kpiCapitalCallInterest");
        if (capCallFooter) {
            capCallFooter.innerText = `추가금융비용(자원부족이자리그): ${simResult.totalCapitalCallInterest.toFixed(1)}억원`;
        }

        const npvText = simResult.projectNPV >= 0 ? `+${simResult.projectNPV.toFixed(1)}` : `${simResult.projectNPV.toFixed(1)}`;
        updateKpi("kpiNPV", `${npvText} <span>억원</span>`);
        
        const discountRateText = document.getElementById("kpiDiscountRateText");
        if (discountRateText) {
            discountRateText.innerText = `할인율 연 ${(inputs.discountRate * 100).toFixed(1)}% 기준 (세전)`;
        }

        const irrText = simResult.projectIRR !== null ? `${simResult.projectIRR.toFixed(2)}` : "N/A";
        updateKpi("kpiIRR", `${irrText} <span>%</span>`);

        const eqIrrTextVal = simResult.equityIRR !== null ? `${simResult.equityIRR.toFixed(2)}%` : "N/A";
        const eqNpvTextVal = simResult.equityNPV >= 0 ? `+${simResult.equityNPV.toFixed(1)}억원` : `${simResult.equityNPV.toFixed(1)}억원`;
        const equityIrrText = document.getElementById("kpiEquityIrrText");
        if (equityIrrText) {
            equityIrrText.innerText = `Equity IRR: ${eqIrrTextVal} | Equity NPV: ${eqNpvTextVal}`;
        }

        // 5. 차트 업데이트
        updateCharts(simResult);

        // 6. 상세 월별 캐시플로우 테이블 생성
        renderCFTable(simResult);

        // 7. 민감도 매트릭스 생성
        renderSensitivityTable(inputs, simResult.netProfit);

        // 8. 인사이트 분석 생성
        renderInsights(simResult);

    } catch (e) {
        console.error("시뮬레이션 실행 중 예외 발생:", e);
    }
}

// 대규모 세부 비용 기반 Cash Flow 시뮬레이션 계산 엔진
function calculateFullCF(inputs) {
    const {
        duration, pfTiming,
        landArea,
        name_apt, name_off, name_rtl, name_clt,
        salesArea_apt, price_apt, start_apt, rate_apt,
        salesArea_off, price_off, start_off, rate_off,
        salesArea_rtl, price_rtl, start_rtl, rate_rtl,
        salesArea_clt, price_clt, start_clt, rate_clt,
        landPricePyVal, landEviction, landCommission, landAcquisitionTax, landOtherRights,
        constructionCostPy, demolitionCost, constructionContingency,
        designCostPy, supervisionCostPy, inflowCostPy, surveyCost, permissionCost, artInstallation,
        mhRent, mhBuild, mhOperation, guaranteeFee, loanGuaranteeFee, adCost, leaseAgencyFee,
        trustFee, generalAgencyFee, appraisalFee, lenderLegalFee, devLegalFee, pmPrePf, pmPostPf,
        siteManagement, cashManageFee, assetManageFee, auditPreFee, insuranceFee, bookkeepFee, auditPostFee, indirectContingency,
        regTaxes, infraCharge, schoolCharge, licenceTax, miscCharge, holdingTax, cityPlanTax,
        equity, blAmount, blFee, blInterest,
        pfTrA, pfTrB, pfTrAInterest, pfTrBInterest, pfTrAFee, pfTrBFee, pfArrangeFee, fiAdvisoryFee, absCosts, undrawnFee, freeInterestHousing, freeInterestRetail,
        capCallInterest, discountRate
    } = inputs;

    // 면적이 0인 경우 매출액 강제 0 처리
    const revApt = salesArea_apt > 0 ? (salesArea_apt * price_apt * (rate_apt / 100)) / 10000 : 0;
    const revOff = salesArea_off > 0 ? (salesArea_off * price_off * (rate_off / 100)) / 10000 : 0;
    const revRtl = salesArea_rtl > 0 ? (salesArea_rtl * price_rtl * (rate_rtl / 100)) / 10000 : 0;
    const revClt = salesArea_clt > 0 ? (salesArea_clt * price_clt * (rate_clt / 100)) / 10000 : 0;
    
    const totalRevenue = revApt + revOff + revRtl + revClt;
    const totalSalesArea = salesArea_apt + salesArea_off + salesArea_rtl + salesArea_clt;
    const totalTargetSalesArea = (salesArea_apt * (rate_apt / 100)) + 
                                 (salesArea_off * (rate_off / 100)) + 
                                 (salesArea_rtl * (rate_rtl / 100)) + 
                                 (salesArea_clt * (rate_clt / 100));
    
    const weightedSalesRate = totalSalesArea > 0 ? (totalTargetSalesArea / totalSalesArea) * 100 : 0;

    const landPriceTotal = (landPricePyVal * landArea) / 10000;
    const landTax = landPriceTotal * landAcquisitionTax;
    const totalLandCost = landPriceTotal + landEviction + landCommission + landTax + landOtherRights;

    const constructionTotal = (constructionCostPy * totalSalesArea) / 10000;
    
    const designTotal = (designCostPy * totalSalesArea) / 10000;
    const supervisionTotal = (supervisionCostPy * totalSalesArea) / 10000;
    const inflowTotal = (inflowCostPy * totalSalesArea) / 10000;

    const pmPreTotal = (pmPrePf * pfTiming) / 10000;
    const pmPostTotal = (pmPostPf * Math.max(0, duration - pfTiming)) / 10000;
    const pmTotal = pmPreTotal + pmPostTotal;

    const monthlyDetails = [];
    let currentBridge = 0;
    let currentPfA = 0;
    let currentPfB = 0;
    
    let cumCapitalCall = 0;
    let totalCapitalCallInterest = 0;
    let nextMonthCapCallInterest = 0;

    const constDuration = Math.max(1, duration - pfTiming);

    function getProductSalesInMonth(t, startMonth, totalRev) {
        if (t < startMonth || totalRev <= 0) return 0;
        if (t === startMonth) {
            return totalRev * 0.10;
        } else if (t === duration) {
            return totalRev * 0.30;
        } else {
            const midPaymentMonths = duration - startMonth - 1;
            return (totalRev * 0.60) / (midPaymentMonths > 0 ? midPaymentMonths : 1);
        }
    }

    for (let t = 1; t <= duration; t++) {
        let cashIn = 0;
        let cashOut = 0;

        let inEquity = 0;
        let inBridge = 0;
        let inPfA = 0;
        let inPfB = 0;
        
        let inSalesApt = getProductSalesInMonth(t, start_apt, revApt);
        let inSalesOff = getProductSalesInMonth(t, start_off, revOff);
        let inSalesRtl = getProductSalesInMonth(t, start_rtl, revRtl);
        let inSalesClt = getProductSalesInMonth(t, start_clt, revClt);
        let inSalesTotal = inSalesApt + inSalesOff + inSalesRtl + inSalesClt;

        if (t === 1) {
            inEquity = equity;
            inBridge = blAmount;
            currentBridge = blAmount;
            cashIn += inEquity + inBridge;
        }

        if (t === pfTiming) {
            inPfA = pfTrA;
            inPfB = pfTrB;
            currentPfA = pfTrA;
            currentPfB = pfTrB;
            cashIn += inPfA + inPfB;
        }

        cashIn += inSalesTotal;

        let outLandPure = 0;
        let outLandEviction = 0;
        let outLandCommission = 0;
        let outLandTax = 0;
        let outLandOtherRights = 0;

        let outConstDocub = 0;
        let outConstDemolition = 0;
        let outConstContingency = 0;

        let outDesign = 0;
        let outSupervision = 0;
        let outInflow = 0;
        let outSurvey = 0;
        let outPermission = 0;
        let outArt = 0;

        let outMhRent = 0;
        let outMhBuild = 0;
        let outMhOperation = 0;
        let outGuaranteeFee = 0;
        let outLoanGuaranteeFee = 0;
        let outAdCost = 0;
        let outLeaseAgencyFee = 0;

        let outTrustFee = 0;
        let outGeneralAgencyFee = 0;
        let outAppraisalFee = 0;
        let outLenderLegalFee = 0;
        let outDevLegalFee = 0;
        let outPm = 0;
        let outSiteManagement = 0;
        let outCashManageFee = 0;
        let outAssetManageFee = 0;
        let outAuditPreFee = 0;
        let outInsuranceFee = 0;
        let outBookkeepFee = 0;
        let outAuditPostFee = 0;
        let outIndirectContingency = 0;

        let outRegTaxes = 0;
        let outInfraCharge = 0;
        let outSchoolCharge = 0;
        let outLicenceTax = 0;
        let outMiscCharge = 0;
        let outHoldingTax = 0;
        let outCityPlanTax = 0;

        let outBlFee = 0;
        let outBlInterest = 0;
        let outPfTrAInterest = 0;
        let outPfTrBInterest = 0;
        let outPfTrAFee = 0;
        let outPfTrBFee = 0;
        let outPfArrangeFee = 0;
        let outFiAdvisoryFee = 0;
        let outAbsCosts = 0;
        let outUndrawnFee = 0;
        let outFreeInterestHousing = 0;
        let outFreeInterestRetail = 0;
        let outCapitalCallInterest = 0;

        if (t === 1) {
            outLandPure = landPriceTotal;
            outLandCommission = landCommission;
            outLandTax = landTax;
            outLandOtherRights = landOtherRights;
        }
        if (t <= pfTiming) {
            outLandEviction = landEviction / pfTiming;
        }

        if (t > pfTiming) {
            const currentConstMonth = t - pfTiming;
            const prevProgress = getSCurveProgress((currentConstMonth - 1) / constDuration);
            const currProgress = getSCurveProgress(currentConstMonth / constDuration);
            const monthlyProgress = currProgress - prevProgress;
            
            outConstDocub = constructionTotal * monthlyProgress;
            outConstContingency = constructionContingency * monthlyProgress;
        }
        if (t >= Math.max(1, pfTiming - 2) && t < pfTiming) {
            outConstDemolition = demolitionCost / 2;
        }

        outDesign = designTotal / duration;
        outSupervision = supervisionTotal / duration;
        if (t > duration - 3) {
            outInflow = inflowTotal / 3;
        }
        if (t <= 6) {
            outSurvey = surveyCost / 6;
            outPermission = permissionCost / 6;
        }
        if (t === duration) {
            outArt = artInstallation;
        }

        const firstSalesStart = Math.min(start_apt, start_off, start_rtl, start_clt);
        const marketingDuration = Math.max(1, duration - firstSalesStart + 1);
        
        if (t >= firstSalesStart) {
            outMhRent = mhRent / marketingDuration;
            outMhOperation = mhOperation / marketingDuration;
            outAdCost = adCost / marketingDuration;
            outLeaseAgencyFee = leaseAgencyFee / marketingDuration;
        }
        if (t >= Math.max(1, firstSalesStart - 3) && t < firstSalesStart) {
            outMhBuild = mhBuild / 3;
        }
        if (t === firstSalesStart) {
            outGuaranteeFee = guaranteeFee;
            outLoanGuaranteeFee = loanGuaranteeFee;
        }

        if (t === pfTiming) {
            outTrustFee = trustFee;
            outAppraisalFee = appraisalFee;
            outLenderLegalFee = lenderLegalFee;
            outDevLegalFee = devLegalFee;
        }
        outGeneralAgencyFee = generalAgencyFee / duration;
        outPm = (t <= pfTiming ? pmPrePf : pmPostPf) / 10000;
        outSiteManagement = siteManagement / duration;
        outCashManageFee = cashManageFee / duration;
        outAssetManageFee = assetManageFee / duration;
        outAuditPreFee = auditPreFee / duration;
        outInsuranceFee = insuranceFee / duration;
        outBookkeepFee = bookkeepFee / duration;
        outAuditPostFee = auditPostFee / duration;
        outIndirectContingency = indirectContingency / duration;

        if (t === 1) {
            outLicenceTax = licenceTax;
        }
        if (t === pfTiming) {
            outInfraCharge = infraCharge;
            outSchoolCharge = schoolCharge;
            outMiscCharge = miscCharge;
        }
        if (t === duration) {
            outRegTaxes = regTaxes;
        }
        if (t % 12 === 9) {
            outHoldingTax = holdingTax / Math.ceil(duration / 12);
            outCityPlanTax = cityPlanTax / Math.ceil(duration / 12);
        }

        if (t === 1) {
            outBlFee = blAmount * blFee;
        }
        if (t > 1 && t <= pfTiming) {
            outBlInterest = currentBridge * (blInterest / 12);
        }
        if (t === pfTiming) {
            outPfTrAFee = pfTrA * pfTrAFee;
            outPfTrBFee = pfTrB * pfTrBFee;
            outPfArrangeFee = (pfTrA + pfTrB) * pfArrangeFee;
            outFiAdvisoryFee = fiAdvisoryFee;
            outAbsCosts = absCosts;
            
            cashOut += currentBridge;
            currentBridge = 0;
        }
        if (t > pfTiming) {
            outPfTrAInterest = currentPfA * (pfTrAInterest / 12);
            outPfTrBInterest = currentPfB * (pfTrBInterest / 12);
            outUndrawnFee = 0;
        }
        if (t > firstSalesStart) {
            outFreeInterestHousing = freeInterestHousing / (duration - firstSalesStart);
            outFreeInterestRetail = freeInterestRetail / (duration - firstSalesStart);
        }

        outCapitalCallInterest = nextMonthCapCallInterest;
        totalCapitalCallInterest += outCapitalCallInterest;

        cashOut += outLandPure + outLandEviction + outLandCommission + outLandTax + outLandOtherRights +
                   outConstDocub + outConstDemolition + outConstContingency +
                   outDesign + outSupervision + outInflow + outSurvey + outPermission + outArt +
                   outMhRent + outMhBuild + outMhOperation + outGuaranteeFee + outLoanGuaranteeFee + outAdCost + outLeaseAgencyFee +
                   outTrustFee + outGeneralAgencyFee + outAppraisalFee + outLenderLegalFee + outDevLegalFee + outPm + outSiteManagement +
                   outCashManageFee + outAssetManageFee + outAuditPreFee + outInsuranceFee + outBookkeepFee + outAuditPostFee + outIndirectContingency +
                   outRegTaxes + outInfraCharge + outSchoolCharge + outLicenceTax + outMiscCharge + outHoldingTax + outCityPlanTax +
                   outBlFee + outBlInterest + outPfTrAInterest + outPfTrBInterest + outPfTrAFee + outPfTrBFee + outPfArrangeFee + outFiAdvisoryFee + outAbsCosts + outUndrawnFee +
                   outFreeInterestHousing + outFreeInterestRetail + outCapitalCallInterest;

        const prevBalance = t === 1 ? 0 : monthlyDetails[t - 2].endingBalance;
        let endingBalance = prevBalance + cashIn - cashOut;

        let capCallExecuted = 0;
        let capCallRepaid = 0;

        let pfRepaidA = 0;
        let pfRepaidB = 0;

        if (endingBalance < 0) {
            capCallExecuted = -endingBalance;
            cumCapitalCall += capCallExecuted;
            endingBalance = 0;
        } else {
            if (cumCapitalCall > 0) {
                capCallRepaid = Math.min(endingBalance, cumCapitalCall);
                cumCapitalCall -= capCallRepaid;
                endingBalance -= capCallRepaid;
            }
            if (endingBalance > 0) {
                if (currentPfB > 0) {
                    pfRepaidB = Math.min(endingBalance, currentPfB);
                    currentPfB -= pfRepaidB;
                    endingBalance -= pfRepaidB;
                }
                if (currentPfA > 0) {
                    pfRepaidA = Math.min(endingBalance, currentPfA);
                    currentPfA -= pfRepaidA;
                    endingBalance -= pfRepaidA;
                }
            }
        }

        nextMonthCapCallInterest = cumCapitalCall * (capCallInterest / 12);

        monthlyDetails.push({
            month: t,
            cashIn,
            cashOut,
            inEquity,
            inBridge,
            inPfA,
            inPfB,
            inSalesApt,
            inSalesOff,
            inSalesRtl,
            inSalesClt,
            inSales: inSalesTotal,
            outLandTotal: outLandPure + outLandEviction + outLandCommission + outLandTax + outLandOtherRights,
            outConstTotal: outConstDocub + outConstDemolition + outConstContingency,
            outIndirectTotal: outDesign + outSupervision + outInflow + outSurvey + outPermission + outArt,
            outSalesTotal: outMhRent + outMhBuild + outMhOperation + outGuaranteeFee + outLoanGuaranteeFee + outAdCost + outLeaseAgencyFee,
            outManagementTotal: outTrustFee + outGeneralAgencyFee + outAppraisalFee + outLenderLegalFee + outDevLegalFee + outPm + outSiteManagement + outCashManageFee + outAssetManageFee + outAuditPreFee + outInsuranceFee + outBookkeepFee + outAuditPostFee + outIndirectContingency,
            outTaxesTotal: outRegTaxes + outInfraCharge + outSchoolCharge + outLicenceTax + outMiscCharge + outHoldingTax + outCityPlanTax,
            outFinanceTotal: outBlFee + outBlInterest + outPfTrAInterest + outPfTrBInterest + outPfTrAFee + outPfTrBFee + outPfArrangeFee + outFiAdvisoryFee + outAbsCosts + outUndrawnFee + outFreeInterestHousing + outFreeInterestRetail + outCapitalCallInterest,
            
            outLandPure, outLandEviction, outLandCommission, outLandTax, outLandOtherRights,
            outConstDocub, outConstDemolition, outConstContingency,
            outDesign, outSupervision, outInflow, outSurvey, outPermission, outArt,
            outMhRent, outMhBuild, outMhOperation, outGuaranteeFee, outLoanGuaranteeFee, outAdCost, outLeaseAgencyFee,
            outTrustFee, outGeneralAgencyFee, outAppraisalFee, outLenderLegalFee, outDevLegalFee, outPm, outSiteManagement, outCashManageFee, outAssetManageFee, outAuditPreFee, outInsuranceFee, outBookkeepFee, outAuditPostFee, outIndirectContingency,
            outRegTaxes, outInfraCharge, outSchoolCharge, outLicenceTax, outMiscCharge, outHoldingTax, outCityPlanTax,
            outBlFee, outBlInterest, outPfTrAInterest, outPfTrBInterest, outPfTrAFee, outPfTrBFee, outPfArrangeFee, outFiAdvisoryFee, outAbsCosts, outUndrawnFee, outFreeInterestHousing, outFreeInterestRetail, outCapitalCallInterest,

            endingBalance,
            capCallExecuted,
            capCallRepaid,
            cumCapitalCall,
            pfRepaidA,
            pfRepaidB,
            endingPfA: currentPfA,
            endingPfB: currentPfB
        });
    }

    let sumLand = 0;
    let sumConst = 0;
    let sumIndirect = 0;
    let sumSales = 0;
    let sumManage = 0;
    let sumTaxes = 0;
    let sumFinance = 0;
    let maxCapitalCall = 0;

    monthlyDetails.forEach(d => {
        sumLand += d.outLandTotal;
        sumConst += d.outConstTotal;
        sumIndirect += d.outIndirectTotal;
        sumSales += d.outSalesTotal;
        sumManage += d.outManagementTotal;
        sumTaxes += d.outTaxesTotal;
        sumFinance += d.outFinanceTotal;
        if (d.cumCapitalCall > maxCapitalCall) {
            maxCapitalCall = d.cumCapitalCall;
        }
    });

    const totalProjectCost = sumLand + sumConst + sumIndirect + sumSales + sumManage + sumTaxes + sumFinance;
    const netProfit = totalRevenue - totalProjectCost;
    const roi = totalProjectCost > 0 ? (netProfit / totalProjectCost) * 100 : 0;
    const bepSalesRate = totalRevenue > 0 ? (totalProjectCost / (totalRevenue / (weightedSalesRate / 100))) * 100 : 0;

    const projectCF = [];
    for (let t = 1; t <= duration; t++) {
        const d = monthlyDetails[t - 1];
        const inflow = d.inSales;
        const outflow = d.outLandTotal + d.outConstTotal + d.outIndirectTotal + d.outSalesTotal + d.outManagementTotal + d.outTaxesTotal;
        projectCF.push({ t, val: inflow - outflow });
    }
    
    const projectIRR = calculateIRR(projectCF);
    const projectNPV = calculateNPV(projectCF, discountRate);

    const equityCF = [];
    for (let t = 1; t <= duration; t++) {
        const d = monthlyDetails[t - 1];
        let val = 0;
        if (t === 1) {
            val = -equity - d.capCallExecuted + d.capCallRepaid + d.outCapitalCallInterest;
        } else if (t === duration) {
            val = -d.capCallExecuted + d.capCallRepaid + d.outCapitalCallInterest + d.endingBalance;
        } else {
            val = -d.capCallExecuted + d.capCallRepaid + d.outCapitalCallInterest;
        }
        equityCF.push({ t, val });
    }

    const equityIRR = calculateIRR(equityCF);
    const equityNPV = calculateNPV(equityCF, discountRate);

    return {
        inputs,
        totalRevenue,
        totalProjectCost,
        netProfit,
        roi,
        bepSalesRate,
        maxCapitalCall,
        totalCapitalCallInterest,
        monthlyDetails,
        totalSalesArea,
        weightedSalesRate,
        projectIRR,
        projectNPV,
        equityIRR,
        equityNPV,
        costs: {
            land: sumLand,
            construction: sumConst,
            indirect: sumIndirect + sumSales + sumManage + sumTaxes,
            finance: sumFinance
        }
    };
}

// 실시간 차트 업데이트 함수
function updateCharts(result) {
    try {
        if (typeof Chart === 'undefined') return;

        const months = result.monthlyDetails.map(d => `${d.month}M`);
        const cumCashFlow = [];
        let cumCash = 0;
        const capCallTrends = result.monthlyDetails.map(d => d.cumCapitalCall);

        result.monthlyDetails.forEach(d => {
            cumCash += (d.cashIn - d.cashOut);
            cumCashFlow.push(cumCash);
        });

        if (cashFlowChart) cashFlowChart.destroy();
        const canvas1 = document.getElementById("cashFlowChart");
        if (canvas1) {
            const ctx1 = canvas1.getContext("2d");
            cashFlowChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [
                        {
                            label: '누적 순현금 (억원)',
                            data: cumCashFlow,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.05)',
                            borderWidth: 2,
                            yAxisID: 'y',
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: '누적 Capital Call 잔액 (억원)',
                            data: capCallTrends,
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderWidth: 2,
                            yAxisID: 'y',
                            tension: 0.1,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#9ca3af' } }
                    },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#9ca3af' } },
                        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#9ca3af' }, title: { display: true, text: '억원', color: '#9ca3af' } }
                    }
                }
            });
        }

        if (costStructureChart) costStructureChart.destroy();
        const canvas2 = document.getElementById("costStructureChart");
        if (canvas2) {
            const ctx2 = canvas2.getContext("2d");
            costStructureChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['토지비', '공사비', '간접비/용역', '금융비용'],
                    datasets: [{
                        data: [
                            result.costs.land,
                            result.costs.construction,
                            result.costs.indirect,
                            result.costs.finance
                        ],
                        backgroundColor: ['#0ea5e9', '#f59e0b', '#9ca3af', '#ef4444'],
                        borderWidth: 1,
                        borderColor: '#111625'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10 } }
                    }
                }
            });
        }
    } catch (e) {
        console.error("차트 에러:", e);
    }
}

// 5x5 민감도 매트릭스 렌더링 함수
function renderSensitivityTable(baseInputs, baseNetProfit) {
    const table = document.getElementById("sensitivityTable");
    if (!table) return;

    table.innerHTML = "";
    const variations = [-0.10, -0.05, 0.00, 0.05, 0.10]; 
    
    let headerRow = "<tr><th>공사비\\분양가</th>";
    variations.forEach(v => {
        const sign = v >= 0 ? "+" : "";
        headerRow += `<th>${sign}${(v * 100).toFixed(0)}%</th>`;
    });
    headerRow += "</tr>";
    table.innerHTML += headerRow;

    variations.forEach(vConst => {
        const signConst = vConst >= 0 ? "+" : "";
        let rowHtml = `<tr><th>${signConst}${(vConst * 100).toFixed(0)}%</th>`;
        
        variations.forEach(vSales => {
            const scenarioInputs = { ...baseInputs };
            scenarioInputs.price_apt = baseInputs.price_apt * (1 + vSales);
            scenarioInputs.price_off = baseInputs.price_off * (1 + vSales);
            scenarioInputs.price_rtl = baseInputs.price_rtl * (1 + vSales);
            scenarioInputs.price_clt = baseInputs.price_clt * (1 + vSales);

            scenarioInputs.constructionCostPy = baseInputs.constructionCostPy * (1 + vConst);

            const scenarioResult = calculateFullCF(scenarioInputs);
            const profit = scenarioResult.netProfit;

            let cellClass = "";
            if (vConst === 0 && vSales === 0) {
                cellClass = "cell-base"; 
            } else if (profit > 0) {
                cellClass = "cell-positive";
            } else if (profit < 0) {
                cellClass = "cell-negative";
            } else {
                cellClass = "cell-neutral";
            }

            rowHtml += `<td class="${cellClass}">${profit.toFixed(1)}</td>`;
        });
        rowHtml += "</tr>";
        table.innerHTML += rowHtml;
    });
}

// 자금 수지 특이사항 리스크 분석 렌더링
function renderInsights(result) {
    const box = document.getElementById("insightBox");
    if (!box) return;

    box.innerHTML = "";
    const insights = [];

    if (result.projectIRR !== null) {
        insights.push({
            type: 'info',
            title: '사업성 투자 지표 (IRR/NPV) 종합 분석',
            content: `본 개발 사업의 세전 **Project IRR은 연 ${result.projectIRR.toFixed(2)}%**이며, **Project NPV는 ${result.projectNPV.toFixed(1)}억원**입니다. 할인율 대비 사업성이 양호한 수준입니다.`
        });
    }

    if (result.maxCapitalCall > 0) {
        const peakMonthObj = result.monthlyDetails.find(d => d.cumCapitalCall === result.maxCapitalCall);
        const peakMonth = peakMonthObj ? peakMonthObj.month : "-";
        insights.push({
            type: 'warning',
            title: '자금 부족(Gap) 발생 리스크 감지',
            content: `사업 기간 중 최대 <strong>${result.maxCapitalCall.toFixed(1)}억원</strong>의 자금 부족이 발생하여 Capital Call(주주 대여금)이 실행됩니다. 최대 부하 시점은 <strong>${peakMonth}개월 차</strong>입니다.`
        });
        
        insights.push({
            type: 'info',
            title: '추가 금융비용 부담 발생',
            content: `자원 부족액 조달에 따라 <strong>${result.totalCapitalCallInterest.toFixed(1)}억원</strong>의 금융 비용(주주 대여이자)이 추가로 사업비에 가산되었습니다. 이로 인해 사업 수익성이 ${((result.totalCapitalCallInterest / result.totalProjectCost) * 100).toFixed(1)}%p 감소했습니다.`
        });
    } else {
        insights.push({
            type: 'success',
            title: '안정적인 현금 흐름 확보',
            content: `현재 금융 조달 구조(Equity + 본 PF) 하에서 사업 완료 시까지 자금 Gap이 전혀 발생하지 않습니다. 추가적인 Capital Call 금융비용 위험은 0%입니다.`
        });
    }

    if (result.bepSalesRate > 100) {
        insights.push({
            type: 'warning',
            title: '사업 손실 우려 (BEP 초과)',
            content: `손익분기점 평균 분양률이 <strong>${result.bepSalesRate.toFixed(1)}%</strong>로 100%를 초과합니다. 현재 분양가 및 공사비 스펙으로는 완판이 되더라도 세전 이익 적자가 불가피합니다. 분양가를 인상하거나 공사비 절감이 시급합니다.`
        });
    } else if (result.bepSalesRate > 80) {
        insights.push({
            type: 'info',
            title: '높은 BEP 허들',
            content: `손익분기점 평균 분양률은 <strong>${result.bepSalesRate.toFixed(1)}%</strong>입니다. 분양 경기가 악화되어 분양률이 이에 미치지 못할 경우 리스크가 큽니다.`
        });
    } else {
        insights.push({
            type: 'success',
            title: '양호한 손익분기점 달성',
            content: `손익분기점 평균 분양률은 <strong>${result.bepSalesRate.toFixed(1)}%</strong> 수준으로, 비교적 낮은 분양률 하에서도 원금 회수 및 리스크 방어가 가능합니다.`
        });
    }

    insights.forEach(ins => {
        const item = document.createElement("div");
        item.className = `insight-item ${ins.type}`;
        
        let iconName = 'info';
        if (ins.type === 'warning') iconName = 'alert-triangle';
        if (ins.type === 'success') iconName = 'check-circle';

        item.innerHTML = `
            <div class="insight-item-title">
                <i data-lucide="${iconName}"></i>
                <span>${ins.title}</span>
            </div>
            <p>${ins.content}</p>
        `;
        box.appendChild(item);
    });

    safeCreateIcons();
}

// 40개 이상 세부 항목 및 접고 펴기(Category Toggle)를 지원하는 CF 테이블 렌더러
function renderCFTable(result) {
    const headerRow = document.getElementById("cfTableHeader");
    const body = document.getElementById("cfTableBody");

    if (!headerRow || !body) return;

    headerRow.innerHTML = "<th>구분 \\ 월차</th>";
    body.innerHTML = "";

    result.monthlyDetails.forEach(d => {
        headerRow.innerHTML += `<th>${d.month}M</th>`;
    });

    // 0평이 아닌 상품 용도 유입 라인업 동적 구성
    const inflowChildren = [
        { label: "자기자본(Equity) 투입", key: "inEquity" },
        { label: "브릿지론 대출 실행", key: "inBridge" },
        { label: "PF Tr.A 대출 인출", key: "inPfA" },
        { label: "PF Tr.B 대출 인출", key: "inPfB" }
    ];

    const inp = result.inputs;
    if (inp.salesArea_apt > 0) {
        inflowChildren.push({ label: `${inp.name_apt} 분양수입금`, key: "inSalesApt", textColor: "text-green" });
    }
    if (inp.salesArea_off > 0) {
        inflowChildren.push({ label: `${inp.name_off} 분양수입금`, key: "inSalesOff", textColor: "text-green" });
    }
    if (inp.salesArea_rtl > 0) {
        inflowChildren.push({ label: `${inp.name_rtl} 분양수입금`, key: "inSalesRtl", textColor: "text-green" });
    }
    if (inp.salesArea_clt > 0) {
        inflowChildren.push({ label: `${inp.name_clt} 분양수입금`, key: "inSalesClt", textColor: "text-green" });
    }

    const tableStructure = [
        {
            category: "자금 유입 (Cash Inflow)",
            key: "cashIn",
            isHeader: true,
            children: inflowChildren
        },
        {
            category: "1. 토지비",
            key: "outLandTotal",
            isHeader: true,
            children: [
                { label: "토지비 원금", key: "outLandPure" },
                { label: "기타 권리 매입비", key: "outLandOtherRights" },
                { label: "명도비용", key: "outLandEviction" },
                { label: "토지매입수수료", key: "outLandCommission" },
                { label: "취득세 및 기타비용", key: "outLandTax" }
            ]
        },
        {
            category: "2. 직접공사비",
            key: "outConstTotal",
            isHeader: true,
            children: [
                { label: "도급공사비 (S-Curve)", key: "outConstDocub" },
                { label: "철거공사비", key: "outConstDemolition" },
                { label: "공사예비비", key: "outConstContingency" }
            ]
        },
        {
            category: "3. 간접공사비",
            key: "outIndirectTotal",
            isHeader: true,
            children: [
                { label: "건축설계비", key: "outDesign" },
                { label: "감리비", key: "outSupervision" },
                { label: "인입공사비", key: "outInflow" },
                { label: "측량 및 지질조사", key: "outSurvey" },
                { label: "인허가비용", key: "outPermission" },
                { label: "미술장식품설치", key: "outArt" }
            ]
        },
        {
            category: "4. 분양관련비",
            key: "outSalesTotal",
            isHeader: true,
            children: [
                { label: "M/H부지임차료", key: "outMhRent" },
                { label: "M/H건립비", key: "outMhBuild" },
                { label: "M/H운영비", key: "outMhOperation" },
                { label: "분양보증수수료", key: "outGuaranteeFee" },
                { label: "중도금대출보증", key: "outLoanGuaranteeFee" },
                { label: "광고홍보비", key: "outAdCost" },
                { label: "임대대행(상가)", key: "outLeaseAgencyFee" }
            ]
        },
        {
            category: "5. 용역비 / 관리비",
            key: "outManagementTotal",
            isHeader: true,
            children: [
                { label: "신탁수수료", key: "outTrustFee" },
                { label: "제용역비", key: "outGeneralAgencyFee" },
                { label: "감정평가수수료", key: "outAppraisalFee" },
                { label: "대주/시공사 법률자문보수", key: "outLenderLegalFee" },
                { label: "법률자문보수", key: "outDevLegalFee" },
                { label: "PM수수료 (시행사운영비)", key: "outPm" },
                { label: "현장관리비", key: "outSiteManagement" },
                { label: "자금관리수수료", key: "outCashManageFee" },
                { label: "자산관리수수료", key: "outAssetManageFee" },
                { label: "내부감사보수", key: "outAuditPreFee" },
                { label: "보험비", key: "outInsuranceFee" },
                { label: "기장대리수수료", key: "outBookkeepFee" },
                { label: "외부감사수수료", key: "outAuditPostFee" },
                { label: "예비비 (Contingency)", key: "outIndirectContingency" }
            ]
        },
        {
            category: "6. 제세공과",
            key: "outTaxesTotal",
            isHeader: true,
            children: [
                { label: "보존등기비", key: "outRegTaxes" },
                { label: "기반시설부담금", key: "outInfraCharge" },
                { label: "학교용지부담금", key: "outSchoolCharge" },
                { label: "등록면허세", key: "outLicenceTax" },
                { label: "각종부담금", key: "outMiscCharge" },
                { label: "토지보유세", key: "outHoldingTax" },
                { label: "도시계획세", key: "outCityPlanTax" }
            ]
        },
        {
            category: "7. 금융비용",
            key: "outFinanceTotal",
            isHeader: true,
            children: [
                { label: "Tr.A 이자", key: "outPfTrAInterest" },
                { label: "Tr.B 이자", key: "outPfTrBInterest" },
                { label: "Tr.A 취급수수료", key: "outPfTrAFee" },
                { label: "Tr.B 취급수수료", key: "outPfTrBFee" },
                { label: "PF주관수수료", key: "outPfArrangeFee" },
                { label: "B/L수수료", key: "outBlFee" },
                { label: "B/L이자", key: "outBlInterest" },
                { label: "FI재무자문수수료", key: "outFiAdvisoryFee" },
                { label: "담보대출유동화비용", key: "outAbsCosts" },
                { label: "미인출수수료", key: "outUndrawnFee" },
                { label: "중도금무이자(주거)", key: "outFreeInterestHousing" },
                { label: "중도금무이자(상가)", key: "outFreeInterestRetail" },
                { label: "Capital Call 추가 자원이자", key: "outCapitalCallInterest", textColor: "text-red" }
            ]
        }
    ];

    tableStructure.forEach((cat, catIdx) => {
        const catClassId = `cat-group-${catIdx}`;

        let catHtml = `<tr class="category-row bold-row" data-target="${catClassId}"><td>${cat.category}</td>`;
        result.monthlyDetails.forEach(d => {
            let val = 0;
            if (cat.key === "cashIn") {
                val = d.cashIn;
            } else {
                val = d[cat.key];
            }
            const formattedVal = val === 0 ? "-" : val.toFixed(1);
            catHtml += `<td>${formattedVal}</td>`;
        });
        catHtml += `</tr>`;
        body.innerHTML += catHtml;

        cat.children.forEach(child => {
            let childHtml = `<tr class="child-row ${catClassId}"><td>${child.label}</td>`;
            result.monthlyDetails.forEach(d => {
                const val = d[child.key];
                const formattedVal = val === 0 ? "-" : val.toFixed(1);
                const textStyle = child.textColor || "";
                childHtml += `<td class="${textStyle}">${formattedVal}</td>`;
            });
            childHtml += `</tr>`;
            body.innerHTML += childHtml;
        });
    });

    const summaryRows = [
        { label: "당월 부족 자금 충당 (Capital Call 실행)", key: "capCallExecuted", textColor: "text-red" },
        { label: "당월 여유 자금 상환 (Capital Call 상환)", key: "capCallRepaid", textColor: "text-green" },
        { label: "누적 Capital Call 잔액 (주주대여금)", key: "cumCapitalCall", isBold: true, textColor: "text-red" },
        { label: "기말 현금 잔고 (Ending Balance)", key: "endingBalance", isSummary: true }
    ];

    summaryRows.forEach(r => {
        let rowClass = r.isBold ? "bold-row" : "";
        if (r.isSummary) rowClass = "summary-row";

        let rowHtml = `<tr class="${rowClass}"><td>${r.label}</td>`;
        result.monthlyDetails.forEach(d => {
            const val = d[r.key];
            const formattedVal = val === 0 ? "-" : val.toFixed(1);
            let style = r.textColor || "";
            if (r.isSummary && val < 0) style = "text-red";
            
            rowHtml += `<td class="${style}">${formattedVal}</td>`;
        });
        rowHtml += `</tr>`;
        body.innerHTML += rowHtml;
    });

    const catRows = body.querySelectorAll(".category-row");
    catRows.forEach(row => {
        row.addEventListener("click", () => {
            row.classList.toggle("collapsed");
            const targetClass = row.getAttribute("data-target");
            const children = body.querySelectorAll(`.${targetClass}`);
            children.forEach(child => {
                child.classList.toggle("collapsed");
            });
        });
    });
}

// 실무 프로젝트 예제 데이터 셋 로딩 함수 (Project Vitamin & 인사동 PFV)
function loadExampleData(type) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    if (type === "vitamin") {
        // 1. 창전동 복합개발 (Project Vitamin) - 엑셀 수지 기준 매핑
        setVal("projectName", "창전동 복합개발사업 (Project Vitamin)");
        setVal("duration", 38);
        setVal("pfTiming", 12);
        setVal("landAreaPy", 1637.5);
        
        // 상품 정보
        setVal("name_apt", "Apartment");
        setVal("salesArea_apt", 3406.2);
        setVal("price_apt", 4528.3);
        setVal("start_apt", 12);
        setVal("rate_apt", 100);

        setVal("name_off", "Officetel");
        setVal("salesArea_off", 8793.6);
        setVal("price_off", 2169.8);
        setVal("start_off", 12);
        setVal("rate_off", 100);

        setVal("name_rtl", "Retail");
        setVal("salesArea_rtl", 2808.5);
        setVal("price_rtl", 2462.5);
        setVal("start_rtl", 15);
        setVal("rate_rtl", 100);

        setVal("name_clt", "Fitness/기타");
        setVal("salesArea_clt", 0.0);
        setVal("price_clt", 0.0);
        setVal("start_clt", 18);
        setVal("rate_clt", 100);

        // 토지비 및 공사비
        setVal("landPricePy", 6130); 
        setVal("landEviction", 0.0);
        setVal("landCommission", 30.6); 
        setVal("landAcquisitionTax", 3.96);
        setVal("landOtherRights", 250.4);
        
        setVal("constructionCostPy", 662.6); 
        setVal("demolitionCost", 55.6);
        setVal("constructionContingency", 49.7);

        // 간접공사비
        setVal("designCostPy", 35);
        setVal("supervisionCostPy", 18);
        setVal("inflowCostPy", 8);
        setVal("surveyCost", 2.0);
        setVal("permissionCost", 1.5);
        setVal("artInstallation", 8.7); 

        // 분양관련비
        setVal("mhRent", 13.5); 
        setVal("mhBuild", 10.0); 
        setVal("mhOperation", 2.7); 
        setVal("guaranteeFee", 4.2);
        setVal("loanGuaranteeFee", 3.1);
        setVal("adCost", 41.4); 
        setVal("leaseAgencyFee", 72.2); 

        // 용역비/관리비
        setVal("trustFee", 1.7); 
        setVal("generalAgencyFee", 5.0);
        setVal("appraisalFee", 3.0);
        setVal("lenderLegalFee", 2.8); 
        setVal("devLegalFee", 2.0); 
        setVal("pmPrePf", 11000); 
        setVal("pmPostPf", 11000); 
        setVal("siteManagement", 4.8); 
        setVal("cashManageFee", 1.5);
        setVal("assetManageFee", 55.8); 
        setVal("auditPreFee", 0.7); 
        setVal("insuranceFee", 0.4); 
        setVal("bookkeepFee", 2.6); 
        setVal("auditPostFee", 2.2); 
        setVal("indirectContingency", 82.8); 

        // 제세공과
        setVal("regTaxes", 62.3); 
        setVal("infraCharge", 10.0); 
        setVal("schoolCharge", 5.1); 
        setVal("licenceTax", 5.0); 
        setVal("miscCharge", 14.0); 
        setVal("holdingTax", 6.8); 
        setVal("cityPlanTax", 10.0); 

        // 금융구조 (Investor Equity 777.8억, Bridge 1200억)
        setVal("equity", 777.8);
        setVal("blAmount", 1200.0); 
        setVal("blFee", 3.0);
        setVal("blInterest", 5.8);
        
        // 본 PF Tr.A 2631억
        setVal("pfTrA", 2631.0); 
        setVal("pfTrB", 0.0);
        setVal("pfTrAInterest", 5.0);
        setVal("pfTrBInterest", 5.0);
        setVal("pfTrAFee", 2.0); 
        setVal("pfTrBFee", 0.0);
        setVal("pfArrangeFee", 1.0);
        setVal("fiAdvisoryFee", 3.0); 
        setVal("absCosts", 19.2); 
        setVal("undrawnFee", 0.0);
        setVal("freeInterestHousing", 0.0);
        setVal("freeInterestRetail", 0.0);

        setVal("capCallInterest", 8.0);
        setVal("discountRate", 6.0);

    } else if (type === "insadong") {
        // 2. 인사동 PFV 개발사업 - PDF 및 실무 수서 기준 매핑
        setVal("projectName", "인사동 복합시설 개발사업 (인사동 PFV)");
        setVal("duration", 36);
        setVal("pfTiming", 10);
        setVal("landAreaPy", 493.8);

        // 상품 정보
        setVal("name_apt", "Apartment");
        setVal("salesArea_apt", 1500.0);
        setVal("price_apt", 3200);
        setVal("start_apt", 15);
        setVal("rate_apt", 100);

        setVal("name_off", "Officetel");
        setVal("salesArea_off", 2470.8);
        setVal("price_off", 2800);
        setVal("start_off", 15);
        setVal("rate_off", 100);

        setVal("name_rtl", "Retail");
        setVal("salesArea_rtl", 700.0);
        setVal("price_rtl", 4500);
        setVal("start_rtl", 20);
        setVal("rate_rtl", 90);

        setVal("name_clt", "문화시설");
        setVal("salesArea_clt", 300.0);
        setVal("price_clt", 2200);
        setVal("start_clt", 24);
        setVal("rate_clt", 100);

        // 토지비 및 공사비
        setVal("landPricePy", 8761); 
        setVal("landEviction", 8.9);
        setVal("landCommission", 2.5);
        setVal("landAcquisitionTax", 5.2);

        setVal("constructionCostPy", 600);
        setVal("demolitionCost", 5.0);
        setVal("constructionContingency", 7.5);

        // 간접공사비
        setVal("designCostPy", 30);
        setVal("supervisionCostPy", 15);
        setVal("inflowCostPy", 7);
        setVal("surveyCost", 3.0);
        setVal("permissionCost", 1.5);
        setVal("artInstallation", 1.5);

        // 분양관련비
        setVal("mhRent", 2.0);
        setVal("mhBuild", 10.0);
        setVal("mhOperation", 5.0);
        setVal("guaranteeFee", 3.5);
        setVal("loanGuaranteeFee", 2.5);
        setVal("adCost", 18.5);
        setVal("leaseAgencyFee", 9.7);

        // 용역비/관리비
        setVal("trustFee", 2.0);
        setVal("generalAgencyFee", 5.2);
        setVal("appraisalFee", 5.0);
        setVal("lenderLegalFee", 2.0);
        setVal("devLegalFee", 4.4);
        setVal("pmPrePf", 2000);
        setVal("pmPostPf", 5000);
        setVal("siteManagement", 3.0);
        setVal("cashManageFee", 1.2);
        setVal("assetManageFee", 3.1);
        setVal("auditPreFee", 0.3);
        setVal("insuranceFee", 0.5);
        setVal("bookkeepFee", 0.6);
        setVal("auditPostFee", 0.5);
        setVal("indirectContingency", 37.1);

        // 제세공과
        setVal("regTaxes", 18.9);
        setVal("infraCharge", 40.0);
        setVal("schoolCharge", 0.0);
        setVal("licenceTax", 0.2);
        setVal("miscCharge", 5.0);
        setVal("holdingTax", 4.0);
        setVal("cityPlanTax", 1.3);

        // 금융구조
        setVal("equity", 52.6);
        setVal("blAmount", 500.0);
        setVal("blFee", 3.0);
        setVal("blInterest", 6.0);
        setVal("pfTrA", 1229.0);
        setVal("pfTrB", 0.0);
        setVal("pfTrAInterest", 6.0);
        setVal("pfTrBInterest", 6.0);
        setVal("pfTrAFee", 1.0);
        setVal("pfTrBFee", 3.0);
        setVal("pfArrangeFee", 1.0);
        setVal("fiAdvisoryFee", 0.0);
        setVal("absCosts", 0.0);
        setVal("landOtherRights", 0.0);
        setVal("undrawnFee", 0.0);
        setVal("freeInterestHousing", 0.0);
        setVal("freeInterestRetail", 0.0);

        setVal("capCallInterest", 8.0);
        setVal("discountRate", 6.0);
    }

    // 변경된 모든 인풋들에 따라 면적 계산을 동기화하기 위한 이벤트 강제 트리거
    const landAreaPy = document.getElementById("landAreaPy");
    if (landAreaPy) {
        landAreaPy.dispatchEvent(new Event("input"));
    }

    // 시뮬레이션 즉각 재실행
    runSimulation();
}
