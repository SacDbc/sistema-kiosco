const SUPABASE_URL = 'https://xsaqhiaiwgqfpghpxarl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_85wjOI6fSpOsaH_Bw8Jn7Q_vP_n2JKJ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let productosGlobales = [];
let categoriasGlobales = [];
let ventasGlobales = [];
let carrito = [];
let medioPagoSeleccionado = 'Efectivo';
let totalVentaActual = 0;
let mostrandoSoloBajoStock = false;

// Navegación Pestañas
function cambiarPestaña(tab) {
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('activo'));

    if (tab === 'ventas') {
        document.getElementById('seccion-ventas').classList.add('activa');
        document.getElementById('btn-tab-ventas').classList.add('activo');
        document.getElementById('buscador').focus();
    } else if (tab === 'stock') {
        document.getElementById('seccion-stock').classList.add('activa');
        document.getElementById('btn-tab-stock').classList.add('activo');
    } else if (tab === 'historial') {
        document.getElementById('seccion-historial').classList.add('activa');
        document.getElementById('btn-tab-historial').classList.add('activo');
        cargarHistorialVentas();
    }
}

async function cargarTodo() {
    await cargarCategorias();
    await cargarProductos();
}

async function cargarCategorias() {
    const { data, error } = await db.from('categorias').select('*').order('nombre', { ascending: true });
    if (error) return console.error(error);

    categoriasGlobales = data;
    poblarSelectoresCategorias(categoriasGlobales);
}

function poblarSelectoresCategorias(lista) {
    const selectProd = document.getElementById('p-categoria-select');
    selectProd.innerHTML = '';
    
    lista.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.nombre;
        opt.innerText = cat.nombre;
        selectProd.appendChild(opt);
    });

    const selectAumento = document.getElementById('aumento-categoria');
    selectAumento.innerHTML = '<option value="">Todas las categorías</option>';
    
    lista.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.nombre;
        opt.innerText = cat.nombre;
        selectAumento.appendChild(opt);
    });
}

async function cargarProductos() {
    const { data, error } = await db.from('productos').select('*').order('id', { ascending: true });
    if (error) return console.error(error);

    productosGlobales = data;
    renderizarFavoritos(productosGlobales);
    renderizarTablaStock(productosGlobales);
}

function renderizarFavoritos(lista) {
    const contenedor = document.getElementById('contenedor-favoritos');
    contenedor.innerHTML = '';

    lista.slice(0, 8).forEach(prod => {
        const btn = document.createElement('button');
        btn.className = 'btn-favorito';
        btn.onclick = () => solicitarCantidadYAgregar(prod);
        
        let colorStock = '#888';
        if (prod.stock <= 0) colorStock = 'red';
        else if (prod.stock <= (prod.stock_minimo || 3)) colorStock = '#d97706';

        btn.innerHTML = `
            ${prod.nombre}<br>
            <span style="color:#28a745;">$${prod.precio}</span><br>
            <small style="color:${colorStock}; font-weight:${prod.stock <= 0 ? 'bold' : 'normal'};">
                ${prod.stock <= 0 ? 'SIN STOCK (' + prod.stock + ')' : 'Stock: ' + prod.stock}
            </small>
        `;
        contenedor.appendChild(btn);
    });
}

function buscarProductosLive() {
    let texto = document.getElementById('buscador').value.toLowerCase().trim();
    const desplegable = document.getElementById('desplegable-resultados');

    if (texto.includes('*')) texto = texto.split('*')[1] || '';
    if (texto.includes('x')) texto = texto.split('x')[1] || '';

    if (texto.length === 0) {
        desplegable.style.display = 'none';
        return;
    }

    const coicidencias = productosGlobales.filter(p => 
        p.nombre.toLowerCase().includes(texto) || 
        (p.codigo_barras && p.codigo_barras.includes(texto)) ||
        (p.categoria && p.categoria.toLowerCase().includes(texto))
    );

    if (coicidencias.length === 0) {
        desplegable.style.display = 'none';
        return;
    }

    desplegable.innerHTML = '';
    coicidencias.forEach(prod => {
        const item = document.createElement('div');
        item.className = 'item-resultado';
        item.onclick = () => {
            solicitarCantidadYAgregar(prod);
            document.getElementById('buscador').value = '';
            desplegable.style.display = 'none';
            document.getElementById('buscador').focus();
        };

        let colorStockText = prod.stock <= 0 ? 'red' : '#666';
        item.innerHTML = `
            <div>
                <strong>${prod.nombre}</strong> <small style="color:#888;">[${prod.categoria || 'General'}]</small><br>
                <small style="color:${colorStockText}; font-weight:bold;">Stock disponible: ${prod.stock} u.</small>
            </div>
            <strong style="color:#28a745; font-size:16px;">$${prod.precio}</strong>
        `;
        desplegable.appendChild(item);
    });

    desplegable.style.display = 'block';
}

function manejarEnter(e) {
    if (e.key === 'Enter') {
        const valorIngresado = document.getElementById('buscador').value.trim();
        if (!valorIngresado) return;

        let cantidad = 1;
        let terminoBusqueda = valorIngresado;

        if (valorIngresado.includes('*')) {
            const partes = valorIngresado.split('*');
            cantidad = parseInt(partes[0]) || 1;
            terminoBusqueda = partes[1].trim();
        } else if (valorIngresado.toLowerCase().includes('x')) {
            const partes = valorIngresado.toLowerCase().split('x');
            cantidad = parseInt(partes[0]) || 1;
            terminoBusqueda = partes[1].trim();
        }

        const prod = productosGlobales.find(p => 
            (p.codigo_barras && p.codigo_barras === terminoBusqueda) || 
            p.nombre.toLowerCase() === terminoBusqueda.toLowerCase()
        );

        if (prod) {
            agregarAlCarrito(prod, cantidad);
            document.getElementById('buscador').value = '';
            document.getElementById('desplegable-resultados').style.display = 'none';
        }
    }
}

function solicitarCantidadYAgregar(producto) {
    let cant = prompt(`¿Cuántas unidades de "${producto.nombre}" deseas agregar?`, "1");
    if (cant !== null) {
        cant = parseInt(cant);
        if (!isNaN(cant) && cant > 0) {
            agregarAlCarrito(producto, cant);
        }
    }
}

function agregarAlCarrito(producto, cantidad = 1) {
    const existe = carrito.find(item => item.id === producto.id);
    if (existe) {
        existe.cantidad += cantidad;
    } else {
        carrito.push({ ...producto, cantidad: cantidad });
    }
    actualizarCarritoUI();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    actualizarCarritoUI();
}

function actualizarCarritoUI() {
    const tbody = document.getElementById('carrito-items-body');
    tbody.innerHTML = '';
    totalVentaActual = 0;

    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        totalVentaActual += subtotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.cantidad}x</strong></td>
            <td>${item.nombre}</td>
            <td>$${subtotal}</td>
            <td><button class="btn-eliminar" onclick="eliminarDelCarrito(${index})">✕</button></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('total-monto').innerText = totalVentaActual;
}

/* MEDIOS DE PAGO Y TICKET */
function abrirModalCobro() {
    if (carrito.length === 0) return alert("El carrito está vacío.");

    document.getElementById('modal-total-pagar').innerText = totalVentaActual;
    document.getElementById('monto-recibido').value = '';
    document.getElementById('tel-cliente').value = '';
    document.getElementById('monto-vuelto-text').innerText = '0';
    seleccionarMedioPago('Efectivo');
    document.getElementById('modal-cobro').style.display = 'flex';
    setTimeout(() => document.getElementById('monto-recibido').focus(), 100);
}

function cerrarModalCobro() {
    document.getElementById('modal-cobro').style.display = 'none';
}

function seleccionarMedioPago(medio) {
    medioPagoSeleccionado = medio;
    document.querySelectorAll('.btn-pago').forEach(b => b.classList.remove('seleccionado'));

    if (medio === 'Efectivo') {
        document.getElementById('btn-pago-efectivo').classList.add('seleccionado');
        document.getElementById('bloque-efectivo').style.display = 'block';
    } else if (medio === 'QR') {
        document.getElementById('btn-pago-qr').classList.add('seleccionado');
        document.getElementById('bloque-efectivo').style.display = 'none';
    } else {
        document.getElementById('btn-pago-transf').classList.add('seleccionado');
        document.getElementById('bloque-efectivo').style.display = 'none';
    }
}

function setMontoRecibido(monto) {
    document.getElementById('monto-recibido').value = monto;
    calcularVuelto();
}

function calcularVuelto() {
    const recibido = Number(document.getElementById('monto-recibido').value) || 0;
    const vuelto = recibido - totalVentaActual;

    const elementoVuelto = document.getElementById('monto-vuelto-text');
    if (vuelto >= 0) {
        elementoVuelto.innerText = vuelto;
        elementoVuelto.style.color = '#2e7d32';
    } else {
        elementoVuelto.innerText = "Falta dinero";
        elementoVuelto.style.color = '#dc3545';
    }
}

// CONFIRMAR VENTA Y OFRECER IMPRESIÓN/WHATSAPP
async function confirmarVentaFinal() {
    if (medioPagoSeleccionado === 'Efectivo') {
        const recibido = Number(document.getElementById('monto-recibido').value) || 0;
        if (recibido < totalVentaActual) {
            alert("⚠️ El monto recibido en efectivo es menor al total a pagar.");
            return;
        }
    }

    const btn = document.getElementById('btn-confirmar-venta');
    btn.disabled = true;
    btn.innerText = "Guardando...";

    const clienteTel = document.getElementById('tel-cliente').value.trim();
    const itemsCopia = [...carrito];
    const totalCopia = totalVentaActual;
    const medioCopia = medioPagoSeleccionado;

    try {
        for (const item of carrito) {
            const nuevoStock = item.stock - item.cantidad;
            await db.from('productos').update({ stock: nuevoStock }).eq('id', item.id);
        }

        const registroVenta = {
            monto_total: totalVentaActual,
            medio_pago: medioPagoSeleccionado,
            items: carrito.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio }))
        };

        await db.from('ventas').insert([registroVenta]);

        // Preguntar al cajero si quiere imprimir o mandar por WhatsApp
        const opcion = confirm(`¡Venta cobrada con éxito!\n\n¿Deseás IMPRIMIR el ticket de compra?\n(Aceptá para Imprimir o Cancelá si solo querés continuar)`);

        if (opcion) {
            imprimirTicketHTML({
                fecha: new Date().toLocaleString('es-AR'),
                medio_pago: medioCopia,
                items: itemsCopia,
                total: totalCopia
            });
        }

        // Si ingresó número de WhatsApp, abre el enlace
        if (clienteTel) {
            enviarTicketWhatsApp(clienteTel, itemsCopia, totalCopia);
        }

        carrito = [];
        actualizarCarritoUI();
        cerrarModalCobro();
        await cargarProductos();
    } catch (e) {
        alert("Error al procesar el cobro.");
    } finally {
        btn.disabled = false;
        btn.innerText = "✔ COBRAR VENTA";
        document.getElementById('buscador').focus();
    }
}

/* LÓGICA DE IMPRESIÓN DE TICKET */
function imprimirTicketHTML(datosVenta) {
    const divTicket = document.getElementById('ticket-impresion');
    
    let lineasItems = '';
    datosVenta.items.forEach(item => {
        lineasItems += `
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <span>${item.cantidad}x ${item.nombre.substring(0,18)}</span>
                <span>$${item.precio * item.cantidad}</span>
            </div>
        `;
    });

    divTicket.innerHTML = `
        <div style="text-align:center; font-weight:bold; font-size:14px;">🏪 KIOSCO EN LÍNEA</div>
        <div style="text-align:center; margin-bottom:8px;">Comprobante de Compra</div>
        <div>--------------------------------</div>
        <div>Fecha: ${datosVenta.fecha}</div>
        <div>Pago: ${datosVenta.medio_pago}</div>
        <div>--------------------------------</div>
        ${lineasItems}
        <div>--------------------------------</div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:14px; margin-top:5px;">
            <span>TOTAL:</span>
            <span>$${datosVenta.total}</span>
        </div>
        <div style="text-align:center; margin-top:15px;">¡Gracias por su compra!</div>
    `;

    window.print();
}

/* ENVIAR TICKET POR WHATSAPP */
function enviarTicketWhatsApp(telefono, items, total) {
    let mensaje = `*🏪 KIOSCO EN LÍNEA - Ticket de Compra*\n\n`;
    items.forEach(i => {
        mensaje += `• ${i.cantidad}x ${i.nombre} - $${i.precio * i.cantidad}\n`;
    });
    mensaje += `\n*TOTAL PAGADO: $${total}*\n¡Gracias por tu compra!`;

    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

/* HISTORIAL Y CIERRE DE CAJA */
async function cargarHistorialVentas() {
    const tbody = document.getElementById('tabla-body-historial');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando historial...</td></tr>';

    const { data, error } = await db.from('ventas').select('*').order('id', { ascending: false }).limit(50);
    if (error) return;

    ventasGlobales = data;
    renderizarHistorial(ventasGlobales);
}

function renderizarHistorial(ventas) {
    const tbody = document.getElementById('tabla-body-historial');
    tbody.innerHTML = '';

    if (ventas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No hay ventas registradas aún.</td></tr>';
        actualizarTotalesCaja(0, 0, 0, 0);
        return;
    }

    let total = 0, efectivo = 0, qr = 0, transf = 0;

    ventas.forEach(v => {
        const monto = Number(v.monto_total) || 0;
        total += monto;

        if (v.medio_pago === 'Efectivo') efectivo += monto;
        else if (v.medio_pago === 'QR') qr += monto;
        else if (v.medio_pago === 'Transferencia') transf += monto;

        const fechaObj = new Date(v.created_at);
        const fechaHora = fechaObj.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const detalleItems = (v.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><small style="color:#666;">${fechaHora}</small></td>
            <td><strong>${v.medio_pago}</strong></td>
            <td><span style="font-size:13px; color:#333;">${detalleItems}</span></td>
            <td><strong style="color:#28a745;">$${monto}</strong></td>
            <td>
                <button onclick="reimprimirTicketHistorial(${v.id})" style="background:#17a2b8; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold;">🧾 Ticket</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    actualizarTotalesCaja(total, efectivo, qr, transf);
}

function reimprimirTicketHistorial(idVenta) {
    const venta = ventasGlobales.find(v => v.id === idVenta);
    if (!venta) return;

    const fechaObj = new Date(venta.created_at);
    imprimirTicketHTML({
        fecha: fechaObj.toLocaleString('es-AR'),
        medio_pago: venta.medio_pago,
        items: venta.items || [],
        total: venta.monto_total
    });
}

function actualizarTotalesCaja(total, efectivo, qr, transf) {
    document.getElementById('caja-total').innerText = `$${total}`;
    document.getElementById('caja-efectivo').innerText = `$${efectivo}`;
    document.getElementById('caja-qr').innerText = `$${qr}`;
    document.getElementById('caja-transf').innerText = `$${transf}`;
}

/* TABLA DE STOCK Y ALERTAS */
function renderizarTablaStock(lista) {
    const tbody = document.getElementById('tabla-body-stock');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">No se encontraron productos.</td></tr>';
        return;
    }

    lista.forEach(prod => {
        const stockMin = prod.stock_minimo !== undefined ? prod.stock_minimo : 3;
        let etiquetaStock = '';

        if (prod.stock <= 0) {
            etiquetaStock = `<span style="color:red; font-weight:bold; background:#ffe6e6; padding:2px 6px; border-radius:4px;">⚠️ ${prod.stock} u. (SIN STOCK)</span>`;
        } else if (prod.stock <= stockMin) {
            etiquetaStock = `<span style="color:#d97706; font-weight:bold; background:#fef3c7; padding:2px 6px; border-radius:4px;">⚠️ ${prod.stock} u. (BAJO)</span>`;
        } else {
            etiquetaStock = `<span style="color:green; font-weight:bold;">${prod.stock} u.</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span style="background:#e9ecef; padding:3px 7px; border-radius:4px; font-size:12px;">${prod.categoria || 'General'}</span></td>
            <td><code>${prod.codigo_barras || 'N/A'}</code></td>
            <td><strong>${prod.nombre}</strong></td>
            <td>$${prod.precio}</td>
            <td>${etiquetaStock}</td>
            <td>
                <button onclick="abrirModalEditar(${prod.id})" style="background:#ffc107; color:#333; border:none; padding:5px 8px; border-radius:3px; cursor:pointer; font-weight:bold; margin-right:5px;">✏️ Editar</button>
                <button onclick="eliminarProducto(${prod.id})" style="background:#dc3545; color:white; border:none; padding:5px 8px; border-radius:3px; cursor:pointer; font-weight:bold;">🗑️ Borrar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarStockBajo() {
    mostrandoSoloBajoStock = !mostrandoSoloBajoStock;
    const btn = event.target;

    if (mostrandoSoloBajoStock) {
        btn.innerText = "📋 Ver Todos los Productos";
        btn.style.background = "#007bff";
        btn.style.color = "white";

        const repuestos = productosGlobales.filter(p => p.stock <= (p.stock_minimo !== undefined ? p.stock_minimo : 3));
        renderizarTablaStock(repuestos);
    } else {
        btn.innerText = "⚠️ Ver Bajo Stock / Reponer";
        btn.style.background = "#ffc107";
        btn.style.color = "#333";
        renderizarTablaStock(productosGlobales);
    }
}

function filtrarTablaStock() {
    const input = document.getElementById('buscador-stock');
    if (!input) return;

    const texto = input.value.toLowerCase().trim();
    if (!texto) {
        renderizarTablaStock(productosGlobales);
        return;
    }

    const filtrados = productosGlobales.filter(p => {
        const nombre = (p.nombre || '').toLowerCase();
        const categoria = (p.categoria || 'general').toLowerCase();
        const codigo = (p.codigo_barras || '').toString().toLowerCase();

        return nombre.includes(texto) || categoria.includes(texto) || codigo.includes(texto);
    });

    renderizarTablaStock(filtrados);
}

function exportarProductosCSV() {
    if (productosGlobales.length === 0) return alert("No hay productos cargados para exportar.");

    let contenidoCSV = "nombre,categoria,precio,stock,codigo_barras\n";
    productosGlobales.forEach(prod => {
        contenidoCSV += `"${prod.nombre}","${prod.categoria || 'General'}",${prod.precio},${prod.stock},${prod.codigo_barras || ''}\n`;
    });

    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_kiosco_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function abrirModalCrear() {
    document.getElementById('modal-titulo-prod').innerText = 'Nuevo Producto';
    document.getElementById('p-id').value = '';
    document.getElementById('p-nombre').value = '';
    document.getElementById('p-categoria-select').value = 'General';
    document.getElementById('p-precio').value = '';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-stock-minimo').value = '3';
    document.getElementById('p-codigo').value = '';
    document.getElementById('modal-producto').style.display = 'flex';
}

function abrirModalEditar(id) {
    const prod = productosGlobales.find(p => p.id === id);
    if (!prod) return;

    document.getElementById('modal-titulo-prod').innerText = 'Editar Producto';
    document.getElementById('p-id').value = prod.id;
    document.getElementById('p-nombre').value = prod.nombre;
    document.getElementById('p-categoria-select').value = prod.categoria || 'General';
    document.getElementById('p-precio').value = prod.precio;
    document.getElementById('p-stock').value = prod.stock;
    document.getElementById('p-stock-minimo').value = prod.stock_minimo !== undefined ? prod.stock_minimo : 3;
    document.getElementById('p-codigo').value = prod.codigo_barras || '';
    document.getElementById('modal-producto').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modal-producto').style.display = 'none';
}

async function guardarProducto() {
    const id = document.getElementById('p-id').value;
    const nombre = document.getElementById('p-nombre').value.trim();
    const categoria = document.getElementById('p-categoria-select').value || 'General';
    const precio = Number(document.getElementById('p-precio').value);
    const stock = Number(document.getElementById('p-stock').value);
    const stockMin = Number(document.getElementById('p-stock-minimo').value);
    const codigo = document.getElementById('p-codigo').value.trim();

    if (!nombre || !precio) return alert("Completá nombre y precio.");

    const datos = {
        nombre,
        categoria,
        precio,
        stock: isNaN(stock) ? 0 : stock,
        stock_minimo: isNaN(stockMin) ? 3 : stockMin,
        codigo_barras: codigo || null
    };

    let error;
    if (id) {
        const res = await db.from('productos').update(datos).eq('id', id);
        error = res.error;
    } else {
        const res = await db.from('productos').insert([datos]);
        error = res.error;
    }

    if (error) alert("Error al guardar en la base de datos.");
    else {
        alert("¡Producto guardado exitosamente!");
        cerrarModal();
        cargarProductos();
    }
}

async function eliminarProducto(id) {
    const prod = productosGlobales.find(p => p.id === id);
    if (!prod) return;

    if (confirm(`¿Estás seguro de eliminar "${prod.nombre}"?`)) {
        const { error } = await db.from('productos').delete().eq('id', id);
        if (error) alert("Error al eliminar.");
        else {
            alert("Producto eliminado.");
            cargarProductos();
        }
    }
}

/* CATEGORÍAS */
function abrirModalCategorias() {
    renderizarListaCategoriasModal();
    document.getElementById('modal-categorias').style.display = 'flex';
}

function cerrarModalCategorias() {
    document.getElementById('modal-categorias').style.display = 'none';
}

function renderizarListaCategoriasModal() {
    const listaUI = document.getElementById('lista-categorias-modal');
    listaUI.innerHTML = '';

    categoriasGlobales.forEach(cat => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:8px 12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;';
        li.innerHTML = `
            <strong>${cat.nombre}</strong>
            ${cat.nombre !== 'General' ? `<button onclick="borrarCategoria(${cat.id}, '${cat.nombre}')" style="background:#dc3545; color:white; border:none; padding:3px 7px; border-radius:3px; cursor:pointer; font-size:12px;">✕</button>` : '<small style="color:#888;">(Por defecto)</small>'}
        `;
        listaUI.appendChild(li);
    });
}

async function crearCategoria() {
    const nombre = document.getElementById('nueva-cat-nombre').value.trim();
    if (!nombre) return alert("Ingresá un nombre de categoría.");

    const { error } = await db.from('categorias').insert([{ nombre }]);

    if (error) {
        alert("La categoría ya existe o surgió un error.");
    } else {
        document.getElementById('nueva-cat-nombre').value = '';
        await cargarCategorias();
        renderizarListaCategoriasModal();
    }
}

async function borrarCategoria(id, nombre) {
    if (confirm(`¿Eliminar la categoría "${nombre}"?`)) {
        const { error } = await db.from('categorias').delete().eq('id', id);
        if (error) alert("No se pudo eliminar.");
        else {
            await cargarCategorias();
            renderizarListaCategoriasModal();
        }
    }
}

/* AUMENTO MASIVO */
async function aplicarAumentoMasivo() {
    const categoriaSel = document.getElementById('aumento-categoria').value;
    const porcentaje = Number(document.getElementById('aumento-porcentaje').value);
    const redondear = document.getElementById('chk-redondear').checked;

    if (!porcentaje || porcentaje <= 0) return alert("Ingresá un porcentaje de aumento válido.");

    const aActualizar = productosGlobales.filter(p => !categoriaSel || (p.categoria || 'General') === categoriaSel);
    if (aActualizar.length === 0) return alert("No hay productos en la categoría seleccionada.");

    if (!confirm(`¿Confirmás aumentar un ${porcentaje}%?`)) return;

    for (const prod of aActualizar) {
        let nuevoPrecio = prod.precio * (1 + (porcentaje / 100));

        if (redondear) {
            nuevoPrecio = Math.ceil(nuevoPrecio / 100) * 100;
        } else {
            nuevoPrecio = Math.round(nuevoPrecio);
        }

        await db.from('productos').update({ precio: nuevoPrecio }).eq('id', prod.id);
    }

    alert("¡Aumento masivo aplicado con éxito!");
    document.getElementById('aumento-porcentaje').value = '';
    await cargarProductos();
}

/* IMPORTACIÓN CSV */
function abrirModalImportar() {
    document.getElementById('modal-importar').style.display = 'flex';
}

function cerrarModalImportar() {
    document.getElementById('modal-importar').style.display = 'none';
    document.getElementById('archivo-csv').value = '';
}

function descargarPlantillaCSV() {
    const contenidoCSV = "nombre,categoria,precio,stock,codigo_barras\nCoca Cola 500ml,Bebidas,1500,20,779123456\nAlfajor Fantoche,Golosinas,600,50,779987654";
    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_productos_kiosco.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function procesarArchivoCSV() {
    const input = document.getElementById('archivo-csv');
    if (!input.files || input.files.length === 0) return alert("Por favor seleccioná un archivo CSV.");

    const archivo = input.files[0];
    const lector = new FileReader();

    const btn = document.getElementById('btn-procesar-importacion');
    btn.disabled = true;

    lector.onload = async function(e) {
        try {
            const lineas = e.target.result.split('\n');
            const nuevosProductos = [];

            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;

                const columnas = linea.split(',');
                if (columnas.length >= 3) {
                    const nombre = columnas[0]?.trim();
                    const categoria = columnas[1]?.trim() || 'General';
                    const precio = Number(columnas[2]?.trim());
                    const stock = Number(columnas[3]?.trim()) || 0;
                    const codigo = columnas[4]?.trim() || null;

                    if (nombre && !isNaN(precio)) {
                        nuevosProductos.push({ nombre, categoria, precio, stock, codigo_barras: codigo, stock_minimo: 3 });
                    }
                }
            }

            if (nuevosProductos.length > 0) {
                await db.from('productos').insert(nuevosProductos);
                alert(`¡Se importaron ${nuevosProductos.length} productos con éxito!`);
                cerrarModalImportar();
                await cargarProductos();
            }
        } catch (err) {
            alert("Error al procesar el archivo.");
        } finally {
            btn.disabled = false;
        }
    };

    lector.readAsText(archivo);
}

// Iniciar app
cargarTodo();
