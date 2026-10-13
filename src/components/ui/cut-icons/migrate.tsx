import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMigrate", ({ weight }) => <>
<path d="M4 13V5H11L14 9H22Q28 9 28 15V27H10Q4 27 4 21V20" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M2 15H13V12L20 18L13 24V21H5Q2 21 2 18Z" fill="currentColor" fillRule="evenodd"/>
</>);
