// 설치(스캐너가 본 것)를 세션 기록의 이름과 맞출 때 쓰는 꼴을 만든다. MCP 서버는 설정 이름·도구 이름 꼴·플러그인 꼴, 스킬은 폴더 이름·머리말 이름(플러그인은 '<플러그인>:<스킬>')이다(순수 함수, 설계 10 「설치와 기록의 이름을 잇는 법」)

/** 도구 이름 꼴. 영문자·숫자·_·- 밖의 글자를 _로 바꾼다(공식 문서 mcp, permissions). */
export function toolForm(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** 호출한 도구 이름(mcp__<서버>__<도구>)에서 얻는 서버 자리의 꼴. 1단계 요약처럼 첫 __ 앞까지만 쓴다(설계 9.5, 10). */
export function callForm(name: string): string {
  return toolForm(name).split("__")[0]!;
}

/** MCP 서버 설치가 기록에 남을 수 있는 이름들(설계 10 「설치와 기록의 이름을 잇는 법」). 중복 없이 차례대로 낸다. */
export function mcpRecordNames(name: string, pluginName: string | null): string[] {
  const forms = pluginName === null ? [name, callForm(name)] : [`plugin:${pluginName}:${name}`, callForm(`plugin_${pluginName}_${name}`)];
  return [...new Set(forms)].sort();
}

/** 스킬 설치가 기록에 남을 수 있는 이름들. 사용자·프로젝트 스킬은 폴더 이름과 머리말 이름, 플러그인 스킬은 그 앞에 '<플러그인>:'을 붙인다. */
export function skillRecordNames(dirName: string, declaredName: string | null, pluginName: string | null): string[] {
  const bare = [dirName, ...(declaredName === null ? [] : [declaredName])];
  if (pluginName === null) return [...new Set(bare)].sort();
  const prefix = `${pluginName}:`;
  return [...new Set(bare.map((name) => (name.startsWith(prefix) ? name : `${prefix}${name}`)))].sort();
}
