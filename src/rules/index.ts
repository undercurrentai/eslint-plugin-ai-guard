import { noEmptyCatch } from './error-handling/no-empty-catch';
import { noBroadException } from './error-handling/no-broad-exception';
import { noAsyncArrayCallback } from './async/no-async-array-callback';
import { noFloatingPromise } from './async/no-floating-promise';
import { noAwaitInLoop } from './async/no-await-in-loop';
import { noHardcodedSecret } from './security/no-hardcoded-secret';
import { noEvalDynamic } from './security/no-eval-dynamic';
import { noSqlStringConcat } from './security/no-sql-string-concat';
import { requireAuthMiddleware } from './security/require-auth-middleware';

/**
 * All rules exported by the plugin.
 * Each key is the rule name (without the plugin prefix).
 */
export const allRules = {
  'no-empty-catch': noEmptyCatch,
  'no-broad-exception': noBroadException,
  'no-async-array-callback': noAsyncArrayCallback,
  'no-floating-promise': noFloatingPromise,
  'no-await-in-loop': noAwaitInLoop,
  'no-hardcoded-secret': noHardcodedSecret,
  'no-eval-dynamic': noEvalDynamic,
  'no-sql-string-concat': noSqlStringConcat,
  'require-auth-middleware': requireAuthMiddleware,
} as const;

export type RuleKey = keyof typeof allRules;
