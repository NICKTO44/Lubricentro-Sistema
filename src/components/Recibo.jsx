import { useRef, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import jsPDF from 'jspdf';
import './Recibo.css';

// 🆕 Formatea la cantidad con su unidad: "2" (unidad), "0.75 kg", "500 g", etc.
function formatearCantidadRecibo(cantidad, unidadMedida) {
  const num = Number(cantidad) || 0;
  const unidades = { KG: 'kg', GRAMO: 'g', LITRO: 'L', ML: 'mL' };
  if (!unidadMedida || unidadMedida === 'UNIDAD') {
    return Number.isInteger(num) ? num.toString() : num.toFixed(2);
  }
  const texto = num.toFixed(3).replace(/\.?0+$/, '');
  return `${texto}${unidades[unidadMedida] || ''}`;
}

function Recibo({ venta, onCerrar }) {
  const reciboRef = useRef(null);
  const [configTienda, setConfigTienda] = useState({
    nombre_tienda: 'MI LUBRICENTRO',
    rfc: '00000000000',
    telefono: '(01) 000-0000',
    direccion: '',
    mensaje_recibo: 'GRACIAS POR SU PREFERENCIA'
  });
  const [imprimiendo, setImprimiendo] = useState(false);
  const [mensajeImpresion, setMensajeImpresion] = useState('');

  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      setConfigTienda(config);
    } catch (error) {
      console.error('Error al cargar configuracion:', error);
    }
  };

  const limpiarTexto = (str) => {
    if (!str) return '';
    return str.replace(/[^\x00-\x7F]/g, '');
  };

  const handleImprimirFisico = async () => {
    setImprimiendo(true);
    setMensajeImpresion('');
    try {
      const datosImpresion = {
        nombre_tienda: limpiarTexto(configTienda.nombre_tienda),
        direccion: limpiarTexto(configTienda.direccion) || null,
        telefono: limpiarTexto(configTienda.telefono) || null,
        items: venta.productos.map(p => ({
          nombre: limpiarTexto(p.nombre),
          cantidad: p.cantidad,
          precio_unitario: p.precio,
          subtotal: p.cantidad * p.precio * (1 - (p.descuento || 0) / 100),
        })),
        total: venta.total,
        efectivo: venta.metodoPago === 'EFECTIVO' ? venta.montoRecibido : null,
        cambio: venta.metodoPago === 'EFECTIVO' ? venta.cambio : null,
        numero_boleta: venta.folio?.toString() || null,
        cajero: limpiarTexto(venta.cajero) || null,
      };

      await invoke('imprimir_boleta', { datos: datosImpresion });
      setMensajeImpresion('Impreso correctamente');
    } catch (error) {
      console.error('Error al imprimir:', error);
      setMensajeImpresion('Error: ' + error);
    } finally {
      setImprimiendo(false);
    }
  };

  const handleDescargarPDF = () => {
    const doc = new jsPDF({
      unit: 'mm',
      format: [80, 297],
      orientation: 'portrait'
    });

    let y = 10;
    const lineHeight = 5;

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(configTienda.nombre_tienda.toUpperCase(), 40, y, { align: 'center' });
    y += lineHeight + 2;
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Sistema de Ventas', 40, y, { align: 'center' });
    y += lineHeight;
    
    if (configTienda.rfc) {
      doc.text(`RFC: ${configTienda.rfc}`, 40, y, { align: 'center' });
      y += lineHeight;
    }
    
    if (configTienda.telefono) {
      doc.text(`Tel: ${configTienda.telefono}`, 40, y, { align: 'center' });
      y += lineHeight;
    }
    
    if (configTienda.direccion) {
      doc.setFontSize(8);
      const direccionLineas = doc.splitTextToSize(configTienda.direccion, 70);
      direccionLineas.forEach(linea => {
        doc.text(linea, 40, y, { align: 'center' });
        y += lineHeight - 1;
      });
      doc.setFontSize(9);
    }
    
    y += 3;
    doc.text('================================', 5, y);
    y += lineHeight + 2;

    doc.setFontSize(9);
    doc.text(`FOLIO: ${venta.folio}`, 5, y);
    y += lineHeight;
    
    const fecha = new Date().toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    doc.text(`FECHA: ${fecha}`, 5, y);
    y += lineHeight;
    doc.text(`CAJERO: ${venta.cajero}`, 5, y);
    y += lineHeight + 3;

    doc.text('================================', 5, y);
    y += lineHeight + 2;

    // 🆕 Tabla de 4 columnas con coordenadas fijas (igual que la vista en pantalla),
    // en vez de texto concatenado a mano — así queda realmente alineado.
    const colCant = 5;
    const colDesc = 14;
    const colUnitRight = 58;  // alineado a la derecha
    const colTotalRight = 75; // alineado a la derecha

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('CANT', colCant, y);
    doc.text('DESCRIPCION', colDesc, y);
    doc.text('P.UNIT', colUnitRight, y, { align: 'right' });
    doc.text('TOTAL', colTotalRight, y, { align: 'right' });
    y += lineHeight - 1;
    doc.line(5, y - 3.5, 75, y - 3.5);
    doc.setFont(undefined, 'normal');

    venta.productos.forEach(producto => {
      const nombreCorto = producto.nombre.length > 20
        ? producto.nombre.substring(0, 19) + '…'
        : producto.nombre;
      const subtotalProducto = producto.cantidad * producto.precio * (1 - (producto.descuento || 0) / 100);

      doc.text(formatearCantidadRecibo(producto.cantidad, producto.unidad_medida), colCant, y);
      doc.text(nombreCorto, colDesc, y);
      doc.text(`S/ ${producto.precio.toFixed(2)}`, colUnitRight, y, { align: 'right' });
      doc.text(`S/ ${subtotalProducto.toFixed(2)}`, colTotalRight, y, { align: 'right' });
      y += lineHeight;
    });
    doc.setFontSize(9);

    y += 2;
    doc.text('================================', 5, y);
    y += lineHeight + 2;

    doc.text(`SUBTOTAL:`, 5, y);
    doc.text(`S/ ${venta.subtotal.toFixed(2)}`, 70, y, { align: 'right' });
    y += lineHeight;

    if (venta.descuento > 0) {
      doc.text(`DESCUENTO:`, 5, y);
      doc.text(`-S/ ${venta.descuento.toFixed(2)}`, 70, y, { align: 'right' });
      y += lineHeight;
    }

    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(`TOTAL:`, 5, y);
    doc.text(`S/ ${venta.total.toFixed(2)}`, 70, y, { align: 'right' });
    y += lineHeight + 3;

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('================================', 5, y);
    y += lineHeight + 2;

    doc.text(`METODO DE PAGO: ${venta.metodoPago}`, 5, y);
    y += lineHeight;

    if (venta.metodoPago === 'EFECTIVO') {
      doc.text(`EFECTIVO: S/ ${venta.montoRecibido.toFixed(2)}`, 5, y);
      y += lineHeight;
      doc.text(`CAMBIO: S/ ${venta.cambio.toFixed(2)}`, 5, y);
      y += lineHeight;
    }

    y += 3;
    doc.text('================================', 5, y);
    y += lineHeight + 2;

    doc.setFont(undefined, 'bold');
    doc.text(configTienda.mensaje_recibo || 'GRACIAS POR SU COMPRA!', 40, y, { align: 'center' });
    y += lineHeight;
    doc.setFont(undefined, 'normal');
    doc.text('Vuelva Pronto', 40, y, { align: 'center' });
    y += lineHeight + 2;
    doc.setFontSize(7);
    doc.text('Este ticket no es valido como factura', 40, y, { align: 'center' });
    y += lineHeight;
    doc.text('Para devoluciones conserve su ticket', 40, y, { align: 'center' });

    doc.save(`Ticket-${venta.folio}.pdf`);
  };

  const handleImprimir = () => {
    const botonesAcciones = document.querySelector('.recibo-acciones');
    if (botonesAcciones) botonesAcciones.style.display = 'none';
    window.print();
    setTimeout(() => {
      if (botonesAcciones) botonesAcciones.style.display = 'flex';
    }, 100);
  };

  const formatearFecha = () => {
    const ahora = new Date();
    return ahora.toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  return (
    <div className="recibo-overlay">
      <div className="recibo-container">
        <div className="recibo-acciones no-print">
          <button
            onClick={handleImprimirFisico}
            className="btn-imprimir"
            disabled={imprimiendo}
          >
            {imprimiendo ? 'Imprimiendo...' : 'Imprimir Ticket'}
          </button>
          <button onClick={handleImprimir} className="btn-imprimir">
            Imprimir normal
          </button>
          <button onClick={handleDescargarPDF} className="btn-descargar">
            Descargar PDF
          </button>
          <button onClick={onCerrar} className="btn-cerrar">
            Cerrar
          </button>
        </div>

        {mensajeImpresion && (
          <div className={`mensaje-impresion ${mensajeImpresion.includes('Error') ? 'error' : 'success'}`}>
            {mensajeImpresion}
          </div>
        )}

        <div className="recibo-ticket" ref={reciboRef}>
          <div className="recibo-header">
            <h1>{configTienda.nombre_tienda}</h1>
            <p>Sistema de Ventas</p>
            {configTienda.rfc && <p>RUC: {configTienda.rfc}</p>}
            {configTienda.telefono && <p>Tel: {configTienda.telefono}</p>}
            {configTienda.direccion && <p className="direccion">{configTienda.direccion}</p>}
          </div>

          <div className="recibo-separador">================================</div>

          <div className="recibo-info">
            <div className="info-row">
              <span>FOLIO:</span>
              <span><strong>{venta.folio}</strong></span>
            </div>
            <div className="info-row">
              <span>FECHA:</span>
              <span>{formatearFecha()}</span>
            </div>
            <div className="info-row">
              <span>CAJERO:</span>
              <span>{venta.cajero}</span>
            </div>
          </div>

          <div className="recibo-separador">================================</div>

          <div className="recibo-productos">
            <table>
              <thead>
                <tr>
                  <th>CANT</th>
                  <th>DESCRIPCION</th>
                  <th>P.UNIT</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {venta.productos.map((producto, index) => (
                  <tr key={index}>
                    <td>{formatearCantidadRecibo(producto.cantidad, producto.unidad_medida)}</td>
                    <td className="desc">{producto.nombre}</td>
                    <td>S/ {producto.precio.toFixed(2)}</td>
                    <td>S/ {(producto.cantidad * producto.precio * (1 - (producto.descuento || 0) / 100)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="recibo-separador">================================</div>

          <div className="recibo-totales">
            <div className="total-row">
              <span>SUBTOTAL:</span>
              <span>S/ {venta.subtotal.toFixed(2)}</span>
            </div>
            {venta.descuento > 0 && (
              <div className="total-row">
                <span>DESCUENTO:</span>
                <span>-S/ {venta.descuento.toFixed(2)}</span>
              </div>
            )}
            <div className="total-row total-final">
              <span><strong>TOTAL:</strong></span>
              <span><strong>S/ {venta.total.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="recibo-separador">================================</div>

          <div className="recibo-pago">
            <div className="pago-row">
              <span>METODO DE PAGO:</span>
              <span><strong>{venta.metodoPago}</strong></span>
            </div>
            {venta.metodoPago === 'EFECTIVO' && (
              <>
                <div className="pago-row">
                  <span>EFECTIVO:</span>
                  <span>S/ {venta.montoRecibido.toFixed(2)}</span>
                </div>
                <div className="pago-row">
                  <span>CAMBIO:</span>
                  <span>S/ {venta.cambio.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          <div className="recibo-separador">================================</div>

          <div className="recibo-footer">
            <p>{configTienda.mensaje_recibo || 'GRACIAS POR SU COMPRA!'}</p>
            <p>Vuelva Pronto</p>
            <p className="small">Este ticket no es valido como factura</p>
            <p className="small">Para devoluciones conserve su ticket</p>
          </div>

          <div className="recibo-separador">================================</div>
        </div>
      </div>
    </div>
  );
}

export default Recibo;