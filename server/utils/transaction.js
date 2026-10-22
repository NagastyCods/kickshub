const mongoose = require('mongoose');

/**
 * Runs `work` inside a MongoDB transaction when the server is a replica set
 * (Atlas). Standalone local MongoDB cannot do multi-document transactions, so
 * we fall back to a normal sequence. Callers that change stock must still be
 * safe if the process stops halfway — see Order.markPaid.
 */
async function withOptionalTransaction(work) {
  const session = await mongoose.startSession();
  let transactionStarted = false;
  try {
    session.startTransaction();
    transactionStarted = true;
  } catch (err) {
    await session.endSession();
    const standalone =
      err.code === 20 ||
      /replica set/i.test(err.message || '') ||
      /Transaction numbers are only allowed/i.test(err.message || '');
    if (!standalone) throw err;
    return work(null);
  }

  try {
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (transactionStarted) await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = { withOptionalTransaction };
