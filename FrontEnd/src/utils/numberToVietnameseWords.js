// ============================================
// numberToVietnameseWords.js
// Chuyển đổi số tiền thành chữ Tiếng Việt chuẩn mực kế toán tài chính
// ============================================

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readThreeDigits(n, showZeroHundred = false) {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const units = remainder % 10;
  let res = '';

  if (hundreds > 0 || showZeroHundred) {
    res += `${DIGITS[hundreds]} trăm `;
  }

  if (tens > 1) {
    res += `${DIGITS[tens]} mươi `;
    if (units === 1) res += 'mốt ';
    else if (units === 5) res += 'lăm ';
    else if (units > 0) res += `${DIGITS[units]} `;
  } else if (tens === 1) {
    res += 'mười ';
    if (units === 5) res += 'lăm ';
    else if (units > 0) res += `${DIGITS[units]} `;
  } else if (tens === 0 && (hundreds > 0 || showZeroHundred)) {
    if (units > 0) {
      res += `lẻ ${DIGITS[units]} `;
    }
  } else {
    if (units > 0) res += `${DIGITS[units]} `;
  }

  return res.trim();
}

export function numberToVietnameseWords(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'Không đồng chẵn';
  if (num < 0) return 'Âm ' + numberToVietnameseWords(Math.abs(num));

  let strNum = num.toString();
  const groups = [];
  while (strNum.length > 0) {
    groups.unshift(parseInt(strNum.slice(-3), 10));
    strNum = strNum.slice(0, -3);
  }

  let words = [];
  for (let i = 0; i < groups.length; i++) {
    const groupVal = groups[i];
    const scaleIndex = groups.length - 1 - i;
    if (groupVal > 0) {
      const showZero = i > 0;
      const groupText = readThreeDigits(groupVal, showZero);
      const scaleText = SCALES[scaleIndex];
      words.push(scaleText ? `${groupText} ${scaleText}` : groupText);
    }
  }

  let result = words.join(' ').trim();
  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return result + ' đồng chẵn.';
}

export default numberToVietnameseWords;
