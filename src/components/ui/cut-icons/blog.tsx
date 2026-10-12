import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutBlog", ({ weight, maskId }) => <>
<path d="M16.5 5H10Q5 5 5 10V27H22Q27 27 27 22V15.5" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M21 3H24Q29 3 29 8V11H26Q21 11 21 6Z" fill="currentColor" fillRule="evenodd"/><path d="M11.3920 16.2000L21.0000 16.2000L21.0000 15.1920Q21.0000 13.8000 19.6080 13.8000L10.0000 13.8000L10.0000 14.8080Q10.0000 16.2000 11.3920 16.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M11.3920 21.2000L17.0000 21.2000L17.0000 20.1920Q17.0000 18.8000 15.6080 18.8000L10.0000 18.8000L10.0000 19.8080Q10.0000 21.2000 11.3920 21.2000Z" fill="currentColor" fillRule="evenodd"/>
</>);
