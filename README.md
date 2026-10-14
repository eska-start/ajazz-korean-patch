# Stream Dock AJAZZ Global 한글 패치

확인 버전: **3.10.191.0421** (`Stream Dock AJAZZ.exe` 기준)

AJAZZ Global판은 한국어 리소스가 들어있지 않습니다.
(콤보박스에는 `한국어`가 보이지만 실제 설정 테이블 15종 중 한국어 테이블이 삭제되어 있음.
삭제된 흔적의 한국어 문자열은 바이너리 곳곳에 남아 있음)
그래서 영어 테이블을 가져와 한국어 값을 입히는 방식으로 한글화했습니다.

## 파일 구성

| 파일 | 설명 |
|---|---|
| `patch.dat` | 변경분 패치 파일 (206KB, 원본 바이너리 미포함) |
| `apply_patch.py` | 패치 적용기. 원본 해시 검증 → `.bak` 백업 → 적용 → 재시작 |
| `patch_korean.py` | 소스 방식 패처. 바이너리에서 한국어 문자열을 직접 수집해 처음부터 패치를 재현 |
| `revert_patch.py` | `.bak` 백업을 원래 자리로 되돌림 |

## 사용법

관리자 권한 PowerShell에서, AJAZZ 설치 폴더가 기본 경로일 때:

```powershell
cd C:\Users\ESKA\Documents\기본 프로젝트\ajazz-korean-patch
python apply_patch.py
```

## 되돌리기

```powershell
python revert_patch.py
```

## 주의

* 적용 전 원본 해시를 검사합니다. 버전이 다르면 해당 파일은 건너뜁니다.
* 앱 업데이트가 뜨면 패치된 파일이 덮어씌워질 수 있습니다.
  업데이트 후 다시 `apply_patch.py`를 실행하십시오. (단, 새 버전에서는 테이블 구조가
  바뀌었을 수 있어 `patch_korean.py`로 재생성이 필요할 수 있습니다.)
* 설정 창의 언어 선택은 그대로 두는 것을 권장합니다.

## 기술 요약

1. 플러그인 37개의 `en.json`을 동봉된 `ko.json` 내용으로 교체
   (`plugins/`, `defaultData/defaultPlugins/`, `%AppData%/HotSpot/StreamDock/plugins/`)
2. `SDLibrary1.dll` / `Stream Dock AJAZZ.exe` 안의 비압축 언어 JSON 청크 중
   영어(`General == "General"`) 청크 값을 한국어로 교체 (전체 길이 동일 유지)
3. `Stream Dock AJAZZ.exe` 안의 압축(qCompress) 활성 영어 설정 테이블 1개를
   한국어로 교체 (zlib 재압축 + 남는 공간 0 패딩, 전체 길이 동일 유지)
4. 바이너리 전체 크기는 1바이트도 변하지 않습니다. `.bak`으로 항상 복구 가능

## 부록: MONSTAR DECK 연동 시도 (미완)

국내 정식판(MONSTAR DECK)은 TS 시리즈 전용이라 AKP 시리즈를 인식하지 못합니다.
`MONSTAR DECK.exe`의 `SupportDevices`에 `AKP153E`를 추가하고
AJAZZ 쪽 `defaultProfiles/AKP153E`를 복사(+`ko` 폴더)해도 USB 판정부에서 막힙니다.
확인된 사항:
* 양쪽 전송 계층은 동일 (HID, libusb 동봉)
* 브랜드+모델 페어 테이블에 이미 `AJAZZ AKP153E`가 들어 있음
* VID/PID 문자열 테이블은 바이너리에 없음 (인증서 오탐 제외)
* 남은 용의자는 코드 쪽 브랜드 판정이며, 실행 파일에 Themida 보호가 있어
  ProcMon 등 추적 도구가 차단됨. USBPcap은 드라이버 활성화에 재부팅 필요.
추가 분석이 필요합니다.
