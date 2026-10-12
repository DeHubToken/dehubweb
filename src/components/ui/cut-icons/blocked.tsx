import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutBlocked", ({ weight, maskId }) => <>
<path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M7.7358 9.4328L23.5515 25.2485L24.2642 24.5358Q25.2485 23.5515 24.2642 22.5672L8.4485 6.7515L7.7358 7.4642Q6.7515 8.4485 7.7358 9.4328Z" fill="currentColor" fillRule="evenodd"/>
</>);
