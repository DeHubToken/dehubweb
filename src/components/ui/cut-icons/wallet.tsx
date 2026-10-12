import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutWallet", ({ weight, maskId }) => <>
<path d="M5 10V7Q5 4 9 4H24V10 M5 10H22Q28 10 28 16V28H11Q5 28 5 22Z M28 16H21Q17 16 17 20V23H28" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M21 18.5H22Q23 18.5 23 19.5V21H22Q21 21 21 20Z" fill="currentColor" fillRule="evenodd"/>
</>);
