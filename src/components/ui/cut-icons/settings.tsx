import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSettings", ({ weight, maskId }) => <>
<path d="M5.3920 11.2000L8.5000 11.2000L8.5000 10.1920Q8.5000 8.8000 7.1080 8.8000L4.0000 8.8000L4.0000 9.8080Q4.0000 11.2000 5.3920 11.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M16.8920 11.2000L28.0000 11.2000L28.0000 10.1920Q28.0000 8.8000 26.6080 8.8000L15.5000 8.8000L15.5000 9.8080Q15.5000 11.2000 16.8920 11.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M5.3920 23.2000L16.5000 23.2000L16.5000 22.1920Q16.5000 20.8000 15.1080 20.8000L4.0000 20.8000L4.0000 21.8080Q4.0000 23.2000 5.3920 23.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M24.8920 23.2000L28.0000 23.2000L28.0000 22.1920Q28.0000 20.8000 26.6080 20.8000L23.5000 20.8000L23.5000 21.8080Q23.5000 23.2000 24.8920 23.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M8.5 6.5H12Q15.5 6.5 15.5 10V13.5H12Q8.5 13.5 8.5 10Z M16.5 18.5H20Q23.5 18.5 23.5 22V25.5H20Q16.5 25.5 16.5 22Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
