import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSearch", ({ weight, maskId }) => <>
<path d="M23 13.5A9.5 9.5 0 1 1 4 13.5A9.5 9.5 0 1 1 23 13.5Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M20.6358 22.3328L27.1515 28.8485L27.8642 28.1358Q28.8485 27.1515 27.8642 26.1672L21.3485 19.6515L20.6358 20.3642Q19.6515 21.3485 20.6358 22.3328Z" fill="currentColor" fillRule="evenodd"/>
</>);
