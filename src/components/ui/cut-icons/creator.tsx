import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCreator", ({ weight }) => <>
<path d="M5 6H16Q28 6 28 16Q28 22 22 22H20Q17 22 17 25Q17 28 13 28Q5 28 5 19Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M9.4 9.4H11Q12.6 9.4 12.6 11V12.6H11Q9.4 12.6 9.4 11Z" fill="currentColor" fillRule="evenodd"/><path d="M17.4 9.4H19Q20.6 9.4 20.6 11V12.6H19Q17.4 12.6 17.4 11Z" fill="currentColor" fillRule="evenodd"/><path d="M21.4 15.4H23Q24.6 15.4 24.6 17V18.6H23Q21.4 18.6 21.4 17Z" fill="currentColor" fillRule="evenodd"/><path d="M8.4 17.4H10Q11.6 17.4 11.6 19V20.6H10Q8.4 20.6 8.4 19Z" fill="currentColor" fillRule="evenodd"/>
</>);
