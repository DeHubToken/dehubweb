import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSuperPowers", ({ weight }) => <>
<path d="M18 3L5 18H14L12 29L27 13H18Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
