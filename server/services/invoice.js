const PDFDocument = require('pdfkit');

function buildInvoice(order, store) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.fontSize(22).text(store.storeName || 'KicksHub');
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor('#444').text(store.address || 'Accra, Ghana');
  doc.text(store.email || '');
  doc.moveDown();
  doc.fillColor('#111').fontSize(16).text(`Invoice ${order.orderNumber}`);
  doc.fontSize(10).text(`Placed ${new Date(order.createdAt).toLocaleString('en-GH')}`);
  doc.text(`Payment: ${order.paymentChannel || 'unpaid'} · ${order.paymentStatus}`);
  doc.text(`Delivery: ${order.deliveryMethod} · ${order.deliveryEstimate || ''}`);
  doc.moveDown();
  doc.fontSize(12).text(order.customerName);
  doc.fontSize(10).text(order.customerEmail);
  const address = order.shippingAddress || {};
  doc.text(`${address.street || ''}, ${address.city || ''}`);
  doc.text(`${address.region || ''} ${address.digitalAddress || ''}`);
  doc.moveDown();

  order.items.forEach((item) => {
    doc.fontSize(11).fillColor('#111').text(`${item.name}  ·  EU ${item.size}  ·  ${item.color}`);
    doc.fontSize(10).fillColor('#444').text(`${item.quantity} × GHS ${Number(item.unitPrice).toFixed(2)} = GHS ${Number(item.lineTotal).toFixed(2)}`);
    doc.moveDown(0.4);
  });

  doc.moveDown();
  doc.fillColor('#111').fontSize(11);
  doc.text(`Subtotal: GHS ${Number(order.subtotal).toFixed(2)}`);
  if (order.discount) doc.text(`Discount: - GHS ${Number(order.discount).toFixed(2)}`);
  doc.text(`Delivery: GHS ${Number(order.deliveryFee).toFixed(2)}`);
  if (order.payOnDeliveryFee) doc.text(`Pay on delivery fee: GHS ${Number(order.payOnDeliveryFee).toFixed(2)}`);
  doc.fontSize(14).text(`Total: GHS ${Number(order.total).toFixed(2)}`);
  doc.end();
  return doc;
}

module.exports = { buildInvoice };
