import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPrompt", ({ weight }) => <>
<path d="M5 22L21 6Q23 4 25 6L27 8L9 26Q7 28 5 26Z M18 9L23 14" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M6 3H8V6H11V8H8V11H6V8H3V6H6Z M24 21H26V24H29V26H26V29H24V26H21V24H24Z" fill="currentColor" fillRule="evenodd"/>
</>);
