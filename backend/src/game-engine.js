import { randomInt } from 'node:crypto';

export function normalizeNumbers(game, numbers) {
  if (!Array.isArray(numbers) || numbers.length !== game.selection_count) {
    throw Object.assign(new Error(`Choose exactly ${game.selection_count} numbers.`), { status: 400 });
  }
  const normalized = numbers.map(Number);
  if (normalized.some((number) => !Number.isInteger(number) || number < game.number_min || number > game.number_max)) {
    throw Object.assign(new Error(`Numbers must be whole numbers from ${game.number_min} to ${game.number_max}.`), { status: 400 });
  }
  if (new Set(normalized).size !== normalized.length) throw Object.assign(new Error('Each selected number must be unique.'), { status: 400 });
  return [...normalized].sort((a, b) => a - b);
}

export function numbersKey(numbers) {
  return [...numbers].sort((a, b) => a - b).join(',');
}

export function generateWinningNumbers(game) {
  const numbers = new Set();
  while (numbers.size < game.selection_count) {
    numbers.add(randomInt(Number(game.number_min), Number(game.number_max) + 1));
  }
  return [...numbers].sort((a, b) => a - b);
}

export function prizeForMatches(prizeInfo = [], matchedCount) {
  return prizeInfo
    .filter((prize) => Number(prize.matches) <= matchedCount)
    .sort((a, b) => Number(b.matches) - Number(a.matches))[0]?.points || 0;
}

export function matchedCount(numbers, winningNumbers) {
  const winning = new Set(winningNumbers.map(Number));
  return numbers.filter((number) => winning.has(Number(number))).length;
}
