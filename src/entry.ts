// 묶은 실행 파일의 시작점. 명령 입구를 돌리고 종료 코드를 넘긴다
import { main } from "./cli.ts";

process.exitCode = await main(process.argv.slice(2));
