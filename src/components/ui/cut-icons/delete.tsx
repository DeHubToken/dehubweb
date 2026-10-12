import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutDelete", ({ weight, maskId }) => <>
<path d="M7 10H25V22Q25 28 19 28H7Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M5.3920 8.2000L28.0000 8.2000L28.0000 7.1920Q28.0000 5.8000 26.6080 5.8000L4.0000 5.8000L4.0000 6.8080Q4.0000 8.2000 5.3920 8.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M12 7V3H17Q20 3 20 6V7" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M11.9500 14.2180L11.9500 23.0000L12.8320 23.0000Q14.0500 23.0000 14.0500 21.7820L14.0500 13.0000L13.1680 13.0000Q11.9500 13.0000 11.9500 14.2180Z" fill="currentColor" fillRule="evenodd"/><path d="M17.9500 14.2180L17.9500 23.0000L18.8320 23.0000Q20.0500 23.0000 20.0500 21.7820L20.0500 13.0000L19.1680 13.0000Q17.9500 13.0000 17.9500 14.2180Z" fill="currentColor" fillRule="evenodd"/>
</>);
