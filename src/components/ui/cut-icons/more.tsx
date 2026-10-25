import React from "react";
import { createCutIcon } from "./create-cut-icon";
import { MORE_DOT_PATHS } from './more-paths';

export default createCutIcon("CutMore", ({ weight, maskId }) => <>
{MORE_DOT_PATHS.map(path => <path key={path} d={path} fill="currentColor" fillRule="evenodd" />)}
</>);
