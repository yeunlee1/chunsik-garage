// 목록의 차례를 끝까지 정하는 데 쓴다. 같은 입력 묶음이면 넣은 차례와 상관없이 결과의 차례가 같아야 한다(순수 함수, 설계 12.2 「차례가 끝까지 정해져 있다」)

/**
 * 앞의 견줌이 모두 같을 때 마지막으로 쓴다. 둘을 통째로 글로 바꿔 글자 차례로 견준다.
 * 글까지 같으면 내용이 같은 것이라 어느 쪽이 앞이어도 결과가 같다.
 * 이름과 경로가 같아도 내용이 다른 사실이 올 수 있어서 둔다. 스캐너가 같은 설치를 두 길로 찾으면 켜짐만 다른 사실 둘을 낸다.
 */
export function byContent(a: unknown, b: unknown): number {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
