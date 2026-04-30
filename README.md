# 광진구청 동행버스 통합 노선

광진구청 동행버스(1호차·2호차) 노선과 실시간 차량 위치를 한 화면에서 확인할 수 있는 정적 웹페이지입니다.

- 좌측: 차량 트리 (1호차 / 2호차)
- 우측: 선택한 노선의 정류장 리스트 + 네이버 지도 + 실시간 차량 GPS 관제 (rideus.net `/map` 페이지 임베드)

## 구조

```
gjshuttle-routes/
├─ index.html              # 메인 페이지
├─ assets/
│  ├─ style.css
│  ├─ app.js
│  └─ logo.png             # (선택) 별도 로고 파일을 이 위치에 저장
└─ data/
   └─ routes.json          # 차량별 routeId 정적 데이터
```

## 로컬 실행

```bash
npx http-server -p 8765 -s --cors
```

브라우저에서 http://localhost:8765 접속.

## 데이터 갱신

`data/routes.json`을 직접 편집해서 routeId를 갱신합니다 (차량 추가/제거 시).
원본 노선 페이지: https://rideus.net/page/gjshuttle

## 라이선스

내부 운영용. 데이터 출처: 광진구청 / (주)그라운드케이.
