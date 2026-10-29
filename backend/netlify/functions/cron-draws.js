import { executeDueDraws } from '../../src/server.js';

export default async function scheduledDraws() {
  try {
    const processed = await executeDueDraws();
    console.log(`Processed ${processed} due draw(s).`);
    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    console.error('Scheduled draw processing failed:', error.message);
    return new Response(JSON.stringify({ ok: false, error: 'Scheduled draw processing failed.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}

export const config = { schedule: '* * * * *' };
