import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWinningNumbers, matchedCount, normalizeNumbers, numbersKey, prizeForMatches } from './game-engine.js';

const game = { number_min: 1, number_max: 30, selection_count: 5, prize_info: [{ matches: 5, points: 500 }, { matches: 4, points: 100 }, { matches: 3, points: 25 }] };

test('normalizes valid selections and creates a stable duplicate key', () => {
  const numbers = normalizeNumbers(game, [30, 2, 7, 5, 12]);
  assert.deepEqual(numbers, [2, 5, 7, 12, 30]);
  assert.equal(numbersKey(numbers), '2,5,7,12,30');
});

test('rejects invalid, duplicate, and incomplete selections', () => {
  assert.throws(() => normalizeNumbers(game, [1, 1, 2, 3, 4]), /unique/);
  assert.throws(() => normalizeNumbers(game, [1, 2, 3]), /exactly 5/);
  assert.throws(() => normalizeNumbers(game, [1, 2, 3, 4, 31]), /from 1 to 30/);
});

test('generates a unique selection inside the configured range', () => {
  const numbers = generateWinningNumbers(game);
  assert.equal(numbers.length, 5);
  assert.equal(new Set(numbers).size, 5);
  assert.ok(numbers.every((number) => number >= 1 && number <= 30));
});

test('counts matches and selects the highest configured prize tier', () => {
  assert.equal(matchedCount([1, 2, 3, 4, 5], [5, 4, 3, 9, 10]), 3);
  assert.equal(prizeForMatches(game.prize_info, 4), 100);
  assert.equal(prizeForMatches(game.prize_info, 2), 0);
});
