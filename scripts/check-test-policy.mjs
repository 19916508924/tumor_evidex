import { getChanges } from './lib/changed-files.mjs';
import { evaluateTestPolicy } from './lib/test-policy.mjs';

const result = evaluateTestPolicy(getChanges());
if (!result.ok) {
  console.error(
    '业务代码发生变化，但没有新增/修改可执行测试：\n' +
      result.sourceFiles.join('\n')
  );
  process.exitCode = 1;
} else {
  console.log(
    `Test policy passed: ${result.sourceFiles.length} source files, ${result.testFiles.length} test files. Review still needs to verify relevance and RED/GREEN evidence.`
  );
}
