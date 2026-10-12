import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutHistory", ({ weight, maskId }) => <>
<path d="M5 12A12 12 0 1 1 5 22" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M2.8000 6.3920L2.8000 13.2000L11.0000 13.2000L11.0000 12.1920Q11.0000 10.8000 9.6080 10.8000L5.2000 10.8000L5.2000 5.0000L4.1920 5.0000Q2.8000 5.0000 2.8000 6.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M14.9000 10.2760L14.9000 17.6798L21.5081 20.9839L21.9213 20.1574Q22.4919 19.0161 21.3506 18.4455L17.1000 16.3202L17.1000 9.0000L16.1760 9.0000Q14.9000 9.0000 14.9000 10.2760Z" fill="currentColor" fillRule="evenodd"/>
</>);
