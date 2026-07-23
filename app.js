const SUPABASE_URL = 'https://xsaqhiaiwgqfpghpxarl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_85wjOI6fSpOsaH_Bw8Jn7Q_vP_n2JKJ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let productosGlobales = [];
let carrito = [];
let medioPagoSeleccionado = 'Efectivo';
let totalVentaActual = 0;

// Navegación entre Pestañas
function cambiarPestaña(tab) {
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('activo'));

    if (tab === 'ventas') {
        document.getElementById('seccion-ventas').classList.add('activa');
        document.getElementById('btn-tab-ventas').classList.add('activo');
        document.getElementById('buscador').focus();
    } else {
        document.getElementById('seccion-stock').classList.add('activa');
        document.getElementById('btn-tab-stock').classList.add('activo');
    }
}

// Carga de productos desde Supabase
async function cargarProductos() {
    const { data, error } = await db.from('productos').select('*').order('id', { ascending: true });
    if (error) return console.error(error);

    productosGlobales = data;
    renderizarFavoritos(productosGlobales);
    renderizarTablaStock(productosGlobales);
}

// Renderizado de Accesos Rápidos (Favoritos)
function renderizarFavoritos(lista) {
    const contenedor = document.getElementById('contenedor-favoritos');
    contenedor.innerHTML = '';

    lista.slice(0, 8).forEach(prod => {
        const btn = document.createElement('button');
        btn.className = 'btn-favorito';
        btn.onclick = () => solicitarCantidadYAgregar(prod);
        btn.innerHTML = `
            ${prod.nombre}<br>
            <span style="color:#28a745;">$${prod.precio}</span><br>
            <small style="color:${prod.stock > 0 ? '#888' : 'red'}; font-weight:normal;">Stock: ${prod.stock}</small>
        `;
        contenedor.appendChild(btn);
    });
}

// Búsqueda en vivo de productos
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
        (p.codigo_barras && p.codigo_barras.includes(texto))
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
        item.innerHTML = `
            <div>
                <strong>${prod.nombre}</strong><br>
                <small style="color:${prod.stock > 0 ? '#666' : 'red'}; font-weight:bold;">Stock disponible: ${prod.stock} u.</small>
            </div>
            <strong style="color:#28a745; font-size:16px;">$${prod.precio}</strong>
        `;
        desplegable.appendChild(item);
    });

    desplegable.style.display = 'block';
}

// Lector de Barras o Teclado Multiplicador (Ej: 5*codigo)
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

// Solicitud manual de cantidad por clic
function solicitarCantidadYAgregar(producto) {
    let cant = prompt(`¿Cuántas unidades de "${producto.nombre}" deseas agregar?`, "1");
    if (cant !== null) {
        cant = parseInt(cant);
        if (!isNaN(cant) && cant > 0) {
            agregarAlCarrito(producto, cant);
        }
    }
}

// Carrito de compras
function agregarAlCarrito(producto, cantidad = 1) {
    if (producto.stock <= 0) {
        alert("⚠️ El producto no tiene stock disponible.");
        return;
    }

    const existe = carrito.find(item => item.id === producto.id);
    const cantidadPrevias = existe ? existe.cantidad : 0;

    if ((cantidadPrevias + cantidad) > producto.stock) {
        alert(`⚠️ No podés agregar ${cantidad} unidades. Stock disponible: ${producto.stock}.`);
        return;
    }

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

/* MEDIOS DE PAGO Y VUELTO */
function abrirModalCobro() {
    if (carrito.length === 0) return alert("El carrito está vacío.");

    document.getElementById('modal-total-pagar').innerText = totalVentaActual;
    document.getElementById('monto-recibido').value = '';
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

    try {
        for (const item of carrito) {
            const nuevoStock = item.stock - item.cantidad;
            await db.from('productos').update({ stock: nuevoStock }).eq('id', item.id);
        }

        alert(`¡Venta cobrada con éxito (${medioPagoSeleccionado})!`);
        carrito = [];
        actualizarCarritoUI();
        cerrarModalCobro();
        await cargarProductos();
    } catch (e) {
        alert("Error al procesar el cobro.");
    } finally {
        btn.disabled = false;
        btn.innerText = "✔ FINALIZAR VENTA";
        document.getElementById('buscador').focus();
    }
}

// Tabla de Stock
function renderizarTablaStock(lista) {
    const tbody = document.getElementById('tabla-body-stock');
    tbody.innerHTML = '';

    lista.forEach(prod => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${prod.codigo_barras || 'N/A'}</code></td>
            <td><strong>${prod.nombre}</strong></td>
            <td>$${prod.precio}</td>
            <td><span style="color: ${prod.stock > 0 ? 'green' : 'red'}; font-weight: bold;">${prod.stock}</span> u.</td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Producto Nuevo
function abrirModal() { document.getElementById('modal-producto').style.display = 'flex'; }
function cerrarModal() {
    document.getElementById('modal-producto').style.display = 'none';
    document.getElementById('p-nombre').value = '';
    document.getElementById('p-precio').value = '';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-codigo').value = '';
}

async function guardarNuevoProducto() {
    const nombre = document.getElementById('p-nombre').value.trim();
    const precio = Number(document.getElementById('p-precio').value);
    const stock = Number(document.getElementById('p-stock').value);
    const codigo = document.getElementById('p-codigo').value.trim();

    if (!nombre || !precio) return alert("Completá nombre y precio.");

    const { error } = await db.from('productos').insert([{ nombre, precio, stock: stock || 0, codigo_barras: codigo || null }]);

    if (error) alert("Error al guardar.");
    else {
        alert("¡Producto guardado!");
        cerrarModal();
        cargarProductos();
    }
}

// Iniciar aplicación
cargarProductos();