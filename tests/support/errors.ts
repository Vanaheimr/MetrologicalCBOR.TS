/*
 * Copyright (c) 2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Metrological CBOR <https://github.com/Vanaheimr/MetrologicalCBOR.TS>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { McborError }          from '../../src/errors.js';
import type { McborErrorCode } from '../../src/errors.js';


/**
 * The code of the error an action raises, or `'no throw'` where it raises none.
 *
 * Asserting on the code rather than on the fact of a throw is what keeps a
 * negative test honest: rejection is the specified behaviour here, and a test
 * that only checks *that* something failed would pass for the wrong reason.
 *
 * Anything that is not one of this library's errors is re-thrown, so a
 * programming mistake inside a test surfaces as itself rather than as a
 * mismatched code.
 */
export function codeOf(action: () => unknown): McborErrorCode | 'no throw' {

    try {
        action();
        return 'no throw';
    }
    catch (error) {
        if (error instanceof McborError)
            return error.code;
        throw error;
    }

}
