// 1회용 교통카드 발권 순서.
// 확인 필요: 발매기 화면 구성과 보증금·환급 절차는 현장 발매기 기준으로 다시 확인해야 한다.
import type { Label } from '../station/types'

export const TICKET_STEPS: Label[] = [
  { ko: '발매기 화면에서 언어를 고르세요 (English 등).', en: 'Choose your language on the screen (e.g. English).' },
  { ko: "'1회용 교통카드'를 고르세요.", en: "Select 'Single Journey Ticket'." },
  { ko: '가는 역을 고르거나 검색하세요. 표시된 금액에는 보증금이 포함돼요.', en: 'Choose or search your destination. The price shown includes a deposit.' },
  { ko: '매수를 고르고 화면에 나온 금액을 넣으세요.', en: 'Choose how many and pay the amount shown.' },
  { ko: '나온 카드를 개찰구에 찍고 들어가세요.', en: 'Tap the card at the gates to enter.' },
  { ko: "도착역에서 나간 뒤 '보증금 환급기'에 카드를 넣으면 보증금을 돌려받아요.", en: "After you exit, put the card in the 'Deposit Refund' machine to get your deposit back." },
]
