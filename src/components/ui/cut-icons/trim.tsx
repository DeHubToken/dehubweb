import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutTrim", ({ weight, maskId }) => <>
<path d="M10 9A4 4 0 1 1 2 9A4 4 0 1 1 10 9Z M10 25A4 4 0 1 1 2 25A4 4 0 1 1 10 25Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M9.2372 12.8225L27.1998 28.8943L27.8720 28.1431Q28.8002 27.1057 27.7628 26.1775L9.8002 10.1057L9.1280 10.8569Q8.1998 11.8943 9.2372 12.8225Z" fill="currentColor" fillRule="evenodd"/><path d="M10.8328 22.8642L28.8485 4.8485L28.1358 4.1358Q27.1515 3.1515 26.1672 4.1358L8.1515 22.1515L8.8642 22.8642Q9.8485 23.8485 10.8328 22.8642Z" fill="currentColor" fillRule="evenodd"/>
</>);
