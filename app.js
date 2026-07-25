const SUPABASE_URL = 'https://xsaqhiaiwgqfpghpxarl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_85wjOI6fSpOsaH_Bw8Jn7Q_vP_n2JKJ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let usuarioActual = null;
let perfilUsuario = null;
let comercioActualId = null;
let comercioObjeto = null;
let cajeroActivoNombre = 'Dueño';
let cajeroActivoObjeto = null;
let cajeroSeleccionadoTemp = null;

let productosGlobales = [];
let categoriasGlobales = [];
let ventasGlobales = [];
let comerciosGlobales = [];
let vendedoresGlobales = [];
let carrito = [];
let medioPagoSeleccionado = 'Efectivo';
let totalVentaActual = 0;
let mostrandoSoloBajoStock = false;
let modoRegistro = false;

let configComercio = {
    nombre: localStorage.getItem('cfg_nombre') || 'Kiosco En Línea',
    direccion: localStorage.getItem('cfg_direccion') || 'Atención al Cliente',
    formato: localStorage.getItem('cfg_formato') || '80mm',
    pinDueno: '0000'
};

// SESIÓN
db.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        usuarioActual = session.user;
        await verificarOcrearPerfil(usuarioActual);
    } else {
        usuarioActual = null;
        perfilUsuario = null;
        document.getElementById('pantalla-login').style.display = 'flex';
        document.getElementById('pantalla-bloqueo').style.display = 'none';
        document.getElementById('pantalla-apertura-turno').style.display = 'none';
        document.getElementById('app-principal').style.display = 'none';
    }
});

async function verificarOcrearPerfil(user) {
    let { data: perfil } = await db.from('perfiles').select('*').eq('user_id', user.id).single();

    if (!perfil) {
        const { data: creado } = await db.from('perfiles').insert([{
            user_id: user.id,
            email: user.email,
            rol: 'dueno'
        }]).select().single();
        perfil = creado;
    }

    perfilUsuario = perfil;

    // A) SUPER ADMIN
    if (perfilUsuario.rol === 'super_admin') {
        document.getElementById('pantalla-login').style.display = 'none';
        document.getElementById('pantalla-bloqueo').style.display = 'none';
        document.getElementById('pantalla-apertura-turno').style.display = 'none';
        document.getElementById('app-principal').style.display = 'block';

        document.getElementById('btn-tab-ventas').style.display = 'none';
        document.getElementById('btn-tab-vendedores').style.display = 'none';
        document.getElementById('btn-tab-admin').style.display = 'inline-block';
        document.getElementById('selector-soporte-admin').style.display = 'block';

        await cargarComerciosSoporte();
        cambiarPestaña('admin');
        return;
    }

    // B) DUEÑO DE COMERCIO
    let comercio;
    if (perfilUsuario.comercio_id) {
        let { data: c } = await db.from('comercios').select('*').eq('id', perfilUsuario.comercio_id).single();
        comercio = c;
    }

    if (!comercio && perfilUsuario.rol === 'dueno') {
        const nombreLocal = localStorage.getItem('temp_nombre_comercio') || 'Mi Kiosco';
        const { data: cNuevo } = await db.from('comercios').insert([{
            nombre_comercio: nombreLocal,
            dueno_id: user.id,
            estado_suscripcion: 'pendiente'
        }]).select().single();

        comercio = cNuevo;
        await db.from('perfiles').update({ comercio_id: comercio.id }).eq('id', perfilUsuario.id);
    }

    comercioObjeto = comercio;
    comercioActualId = comercio.id;
    configComercio.nombre = comercio.nombre_comercio;
    configComercio.pinDueno = comercio.pin_dueno || '0000';

    if (comercio.estado_suscripcion === 'pendiente') {
        document.getElementById('pantalla-login').style.display = 'none';
        document.getElementById('pantalla-bloqueo').style.display = 'flex';
        document.getElementById('titulo-bloqueo').innerText = "Cuenta Pendiente de Aprobación";
        document.getElementById('mensaje-bloqueo').innerText = "Tu comercio fue registrado. Sergio habilitará tu acceso en breve.";
        document.getElementById('app-principal').style.display = 'none';
        return;
    } else if (comercio.estado_suscripcion === 'vencido') {
        document.getElementById('pantalla-login').style.display = 'none';
        document.getElementById('pantalla-bloqueo').style.display = 'flex';
        document.getElementById('titulo-bloqueo').innerText = "Suscripción Vencida";
        document.getElementById('mensaje-bloqueo').innerText = "Tu cuenta se encuentra suspendida o vencida. Contactate con Administración.";
        document.getElementById('app-principal').style.display = 'none';
        return;
    }

    document.getElementById('pantalla-login').style.display = 'none';
    document.getElementById('pantalla-bloqueo').style.display = 'none';
    document.getElementById('app-principal').style.display = 'block';

    await cargarTodo();
    solicitarAperturaTurno();
}

function toggleModoAuth(e) {
    e.preventDefault();
    modoRegistro = !modoRegistro;
    
    document.getElementById('login-subtitulo').innerText = modoRegistro ? 'Registrá tu Comercio gratis' : 'Ingresá a tu cuenta';
    document.getElementById('btn-auth-submit').innerText = modoRegistro ? 'Registrar Comercio' : 'Ingresar';
    document.getElementById('text-toggle-auth').innerText = modoRegistro ? '¿Ya tenés cuenta?' : '¿Registrar nuevo comercio?';
    document.getElementById('link-toggle-auth').innerText = modoRegistro ? 'Ingresá acá' : 'Registrate acá';
    document.getElementById('bloque-nombre-comercio').style.display = modoRegistro ? 'block' : 'none';
}

async function manejarAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value.trim();
    const nombreComercio = document.getElementById('auth-comercio').value.trim();
    const btn = document.getElementById('btn-auth-submit');

    btn.disabled = true;
    btn.innerText = "Procesando...";

    if (modoRegistro) {
        if (!nombreComercio) {
            alert("Ingresá el nombre de tu comercio.");
            btn.disabled = false;
            btn.innerText = 'Registrar Comercio';
            return;
        }

        const { data: perfilExistente } = await db.from('perfiles').select('id, email').eq('email', email).maybeSingle();

        if (perfilExistente) {
            alert("⚠️ Este correo ya tiene un comercio registrado. Contactate con administración para agregar sucursales.");
            btn.disabled = false;
            btn.innerText = 'Registrar Comercio';
            return;
        }

        const { data: authData, error: authError } = await db.auth.signUp({ email, password });
        
        if (authError) {
            alert("Error al registrar: " + authError.message);
            btn.disabled = false;
            btn.innerText = 'Registrar Comercio';
            return;
        }

        if (authData && authData.user) {
            const userId = authData.user.id;

            const { data: comercioCreado, error: comError } = await db.from('comercios').insert([{
                nombre_comercio: nombreComercio,
                dueno_id: userId,
                estado_suscripcion: 'pendiente'
            }]).select().single();

            if (!comError && comercioCreado) {
                await db.from('perfiles').insert([{
                    user_id: userId,
                    email: email,
                    rol: 'dueno',
                    comercio_id: comercioCreado.id
                }]);

                localStorage.setItem('cfg_nombre', nombreComercio);
            }

            alert("¡Registro enviado con éxito! El administrador habilitará tu cuenta en breve.");
            await db.auth.signOut();
            location.reload();
        }
    } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) alert("Credenciales incorrectas: " + error.message);
    }

    btn.disabled = false;
    btn.innerText = modoRegistro ? 'Registrar Comercio' : 'Ingresar';
}

async function cerrarSesion() {
    await db.auth.signOut();
    location.reload();
}

/* APERTURA TURNO Y CONTROL PERMISOS */
function solicitarAperturaTurno() {
    renderizarBotonesAperturaTurno();
    document.getElementById('bloque-ingreso-pin-apertura').style.display = 'none';
    document.getElementById('pantalla-apertura-turno').style.display = 'flex';
}

function renderizarBotonesAperturaTurno() {
    const contenedor = document.getElementById('grid-cajeros-apertura');
    contenedor.innerHTML = '';

    vendedoresGlobales.forEach(v => {
        const btn = document.createElement('button');
        btn.style.cssText = 'background:#f8f9fa; border:2px solid #007bff; padding:15px; border-radius:8px; font-size:16px; font-weight:bold; color:#007bff; cursor:pointer; text-align:center;';
        btn.innerText = `👤 ${v.nombre}`;
        btn.onclick = () => seleccionarCajeroParaPin(v);
        contenedor.appendChild(btn);
    });

    if (vendedoresGlobales.length === 0) {
        contenedor.innerHTML = '<div style="grid-column: span 2; color:#888; font-size:13px;">No hay vendedores registrados aún.<br>Podés entrar como Dueño.</div>';
    }
}

function seleccionarCajeroParaPin(vendedor) {
    cajeroSeleccionadoTemp = vendedor;
    document.getElementById('label-cajero-seleccionado').innerText = `PIN de ${vendedor.nombre}:`;
    document.getElementById('input-pin-apertura').value = '';
    document.getElementById('bloque-ingreso-pin-apertura').style.display = 'block';
    setTimeout(() => document.getElementById('input-pin-apertura').focus(), 100);
}

function cancelarSeleccionCajero() {
    cajeroSeleccionadoTemp = null;
    document.getElementById('bloque-ingreso-pin-apertura').style.display = 'none';
}

function confirmarIngresoTurno() {
    const pin = document.getElementById('input-pin-apertura').value.trim();
    if (cajeroSeleccionadoTemp && cajeroSeleccionadoTemp.pin === pin) {
        cajeroActivoNombre = cajeroSeleccionadoTemp.nombre;
        cajeroActivoObjeto = cajeroSeleccionadoTemp;
        
        actualizarNombreCajeroUI();
        aplicarPermisosVisuales();
        document.getElementById('pantalla-apertura-turno').style.display = 'none';
        cambiarPestaña('ventas');
    } else {
        alert("⚠️ PIN Incorrecto.");
    }
}

function ingresarComoDuenoDirecto() {
    const pin = prompt("Ingresá tu PIN de Dueño / Administrador:", "");
    if (pin === configComercio.pinDueno) {
        cajeroActivoNombre = 'Dueño';
        cajeroActivoObjeto = null;
        actualizarNombreCajeroUI();
        aplicarPermisosVisuales();
        document.getElementById('pantalla-apertura-turno').style.display = 'none';
        cambiarPestaña('ventas');
    } else if (pin !== null) {
        alert("⚠️ PIN de Dueño incorrecto.");
    }
}

function aplicarPermisosVisuales() {
    const btnStock = document.getElementById('btn-tab-stock');
    const btnHistorial = document.getElementById('btn-tab-historial');
    const btnVend = document.getElementById('btn-tab-vendedores');
    const btnConfig = document.getElementById('btn-tab-config');

    if (cajeroActivoNombre === 'Dueño' || perfilUsuario.rol === 'super_admin') {
        btnStock.style.display = 'inline-block';
        btnHistorial.style.display = 'inline-block';
        btnVend.style.display = 'inline-block';
        btnConfig.style.display = 'inline-block';
    } else if (cajeroActivoObjeto) {
        btnStock.style.display = cajeroActivoObjeto.perm_stock ? 'inline-block' : 'none';
        btnHistorial.style.display = cajeroActivoObjeto.perm_historial ? 'inline-block' : 'none';
        btnVend.style.display = cajeroActivoObjeto.perm_vendedores ? 'inline-block' : 'none';
        btnConfig.style.display = 'none';
    }
}

function intentarAccesoProtegido(tab) {
    if (cajeroActivoNombre === 'Dueño' || perfilUsuario.rol === 'super_admin') {
        if (tab === 'config') abrirModalConfig();
        else cambiarPestaña(tab);
        return;
    }

    let tienePermiso = false;
    if (cajeroActivoObjeto) {
        if (tab === 'stock' && cajeroActivoObjeto.perm_stock) tienePermiso = true;
        if (tab === 'historial' && cajeroActivoObjeto.perm_historial) tienePermiso = true;
        if (tab === 'vendedores' && cajeroActivoObjeto.perm_vendedores) tienePermiso = true;
    }

    if (tienePermiso) {
        cambiarPestaña(tab);
    } else {
        const pin = prompt(`🔒 Área protegida. Ingresá el PIN de Dueño para acceder a ${tab.toUpperCase()}:`, "");
        if (pin === configComercio.pinDueno) {
            if (tab === 'config') abrirModalConfig();
            else cambiarPestaña(tab);
        } else if (pin !== null) {
            alert("⚠️ Acceso denegado. PIN de Dueño incorrecto.");
        }
    }
}

function actualizarNombreCajeroUI() {
    const elem = document.getElementById('nombre-cajero-activo');
    if (elem) elem.innerText = cajeroActivoNombre;
}

/* VENDEDORES */
async function cargarVendedores() {
    if (!comercioActualId) return;
    const { data } = await db.from('vendedores').select('*').eq('comercio_id', comercioActualId).order('nombre', { ascending: true });
    vendedoresGlobales = data || [];
    renderizarTablaVendedores();
}

function renderizarTablaVendedores() {
    const tbody = document.getElementById('tabla-body-vendedores');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (vendedoresGlobales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No hay vendedores cargados.</td></tr>';
        return;
    }

    vendedoresGlobales.forEach(v => {
        let listaPermisos = ['🛒 Punto Venta'];
        if (v.perm_stock) listaPermisos.push('📦 Stock');
        if (v.perm_historial) listaPermisos.push('📊 Caja');
        if (v.perm_vendedores) listaPermisos.push('👥 Vendedores');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${v.nombre}</strong></td>
            <td><small style="color:#007bff; font-weight:bold;">${listaPermisos.join(' | ')}</small></td>
            <td><code>****</code></td>
            <td>
                <button onclick="abrirModalEditarVendedor(${v.id})" style="background:#ffc107; color:#333; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-weight:bold; margin-right:5px;">✏️ Editar</button>
                <button onclick="eliminarVendedor(${v.id})" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-weight:bold;">🗑️ Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalVendedor() {
    document.getElementById('modal-vendedor-titulo').innerText = '➕ Nuevo Vendedor';
    document.getElementById('vend-id').value = '';
    document.getElementById('vend-nombre').value = '';
    document.getElementById('vend-pin').value = '';
    
    document.getElementById('chk-perm-stock').checked = false;
    document.getElementById('chk-perm-historial').checked = false;
    document.getElementById('chk-perm-vendedores').checked = false;

    document.getElementById('modal-vendedor').style.display = 'flex';
}

function abrirModalEditarVendedor(id) {
    const v = vendedoresGlobales.find(item => item.id === id);
    if (!v) return;

    document.getElementById('modal-vendedor-titulo').innerText = '✏️ Editar Vendedor';
    document.getElementById('vend-id').value = v.id;
    document.getElementById('vend-nombre').value = v.nombre;
    document.getElementById('vend-pin').value = v.pin || '';

    document.getElementById('chk-perm-stock').checked = v.perm_stock || false;
    document.getElementById('chk-perm-historial').checked = v.perm_historial || false;
    document.getElementById('chk-perm-vendedores').checked = v.perm_vendedores || false;

    document.getElementById('modal-vendedor').style.display = 'flex';
}

function cerrarModalVendedor() {
    document.getElementById('modal-vendedor').style.display = 'none';
}

async function guardarVendedorNuevo() {
    const id = document.getElementById('vend-id').value;
    const nombre = document.getElementById('vend-nombre').value.trim();
    const pin = document.getElementById('vend-pin').value.trim();

    const perm_stock = document.getElementById('chk-perm-stock').checked;
    const perm_historial = document.getElementById('chk-perm-historial').checked;
    const perm_vendedores = document.getElementById('chk-perm-vendedores').checked;

    if (!nombre || !pin) return alert("Completá el nombre y el PIN numérico.");

    const datos = {
        comercio_id: comercioActualId,
        nombre,
        pin,
        perm_stock,
        perm_historial,
        perm_vendedores
    };

    let error;
    if (id) {
        const res = await db.from('vendedores').update(datos).eq('id', id);
        error = res.error;
    } else {
        const res = await db.from('vendedores').insert([datos]);
        error = res.error;
    }

    if (error) {
        alert("Error al guardar vendedor.");
    } else {
        alert("¡Vendedor guardado con éxito!");
        cerrarModalVendedor();
        await cargarVendedores();
    }
}

async function eliminarVendedor(id) {
    if (confirm("¿Eliminar a este vendedor?")) {
        await db.from('vendedores').delete().eq('id', id);
        await cargarVendedores();
    }
}

/* NAVEGACIÓN Y PANEL ADMIN */
async function cargarComerciosSoporte() {
    const select = document.getElementById('select-comercio-soporte');
    select.innerHTML = '';

    const { data: list } = await db.from('comercios').select('*').order('nombre_comercio', { ascending: true });
    comerciosGlobales = list || [];

    comerciosGlobales.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nombre_comercio;
        select.appendChild(opt);
    });

    if (comerciosGlobales.length > 0) {
        comercioActualId = comerciosGlobales[0].id;
        configComercio.nombre = comerciosGlobales[0].nombre_comercio;
    }
}

function cambiarComercioSoporte() {
    const selId = Number(document.getElementById('select-comercio-soporte').value);
    comercioActualId = selId;
    const comm = comerciosGlobales.find(c => c.id === selId);
    if (comm) configComercio.nombre = comm.nombre_comercio;

    aplicarConfiguracionUI();
    cargarTodo();
}

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
    } else if (tab === 'vendedores') {
        document.getElementById('seccion-vendedores').classList.add('activa');
        document.getElementById('btn-tab-vendedores').classList.add('activo');
        cargarVendedores();
    } else if (tab === 'admin') {
        document.getElementById('seccion-admin').classList.add('activa');
        document.getElementById('btn-tab-admin').classList.add('activo');
        cargarTablaAdmin();
    }
}

async function cargarTodo() {
    aplicarConfiguracionUI();
    await cargarCategorias();
    await cargarProductos();
    await cargarVendedores();
}

function abrirModalConfig() {
    document.getElementById('cfg-nombre-comercio').value = configComercio.nombre;
    document.getElementById('cfg-direccion').value = configComercio.direccion;
    document.getElementById('cfg-pin-dueno').value = configComercio.pinDueno;
    document.getElementById('cfg-formato-impresora').value = configComercio.formato;
    document.getElementById('modal-config').style.display = 'flex';
}

function cerrarModalConfig() {
    document.getElementById('modal-config').style.display = 'none';
}

function guardarConfiguracion() {
    const nombre = document.getElementById('cfg-nombre-comercio').value.trim() || 'Kiosco En Línea';
    const direccion = document.getElementById('cfg-direccion').value.trim() || 'Atención al Cliente';
    const pinDueno = document.getElementById('cfg-pin-dueno').value.trim() || '0000';
    const formato = document.getElementById('cfg-formato-impresora').value;

    configComercio = { nombre, direccion, formato, pinDueno };

    localStorage.setItem('cfg_nombre', nombre);
    localStorage.setItem('cfg_direccion', direccion);
    localStorage.setItem('cfg_formato', formato);

    if (perfilUsuario && perfilUsuario.rol === 'dueno') {
        db.from('comercios').update({ pin_dueno: pinDueno }).eq('id', comercioActualId);
    }

    aplicarConfiguracionUI();
    cerrarModalConfig();
    alert("¡Configuración guardada correctamente!");
}

function aplicarConfiguracionUI() {
    const headerTitulo = document.getElementById('header-titulo-local');
    if (headerTitulo) {
        headerTitulo.innerText = `🏪 ${configComercio.nombre}`;
    }
}

/* ALTA DIRECTA / PANEL ADMIN */
async function cargarTablaAdmin() {
    const tbody = document.getElementById('tabla-body-admin');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando clientes...</td></tr>';

    const { data: comercios } = await db.from('comercios').select('*').order('id', { ascending: true });
    if (!comercios) return;

    tbody.innerHTML = '';
    for (const c of comercios) {
        const estado = c.estado_suscripcion || 'pendiente';
        let badgeStyle = '#ffc107';
        let badgeText = '⏳ PENDIENTE DE ALTA';

        if (estado === 'activo') {
            badgeStyle = '#28a745';
            badgeText = '🟢 ACTIVO';
        } else if (estado === 'vencido') {
            badgeStyle = '#dc3545';
            badgeText = '🔴 SUSPENDIDO / VENCIDO';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.nombre_comercio}</strong></td>
            <td><small>${c.dueno_id}</small></td>
            <td>
                <span style="background:${badgeStyle}; color:white; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:12px;">
                    ${badgeText}
                </span>
            </td>
            <td>
                ${estado === 'pendiente' ? `<button onclick="cambiarEstadoComercio(${c.id}, 'activo')" style="background:#28a745; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:5px;">✅ Dar de Alta</button>` : ''}
                ${estado === 'activo' ? `<button onclick="cambiarEstadoComercio(${c.id}, 'vencido')" style="background:#dc3545; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">🚫 Suspender</button>` : ''}
                ${estado === 'vencido' ? `<button onclick="cambiarEstadoComercio(${c.id}, 'activo')" style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">⚡ Reactivar Acceso</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    }
}

async function cambiarEstadoComercio(idComercio, nuevoEstado) {
    await db.from('comercios').update({ estado_suscripcion: nuevoEstado }).eq('id', idComercio);
    alert(`Estado del comercio actualizado a: ${nuevoEstado.toUpperCase()}`);
    cargarTablaAdmin();
}

/* CARGA Y RENDERIZADO DE PRODUCTOS Y FAVORITOS */
async function cargarCategorias() {
    if (!comercioActualId) return;
    const { data } = await db.from('categorias').select('*').eq('comercio_id', comercioActualId).order('nombre', { ascending: true });

    categoriasGlobales = data || [];
    
    const catsEnProductos = [...new Set(productosGlobales.map(p => p.categoria || 'General'))];
    for (const catNombre of catsEnProductos) {
        const existe = categoriasGlobales.find(c => c.nombre.toLowerCase() === catNombre.toLowerCase());
        if (!existe) {
            await db.from('categorias').insert([{ user_id: usuarioActual.id, comercio_id: comercioActualId, nombre: catNombre }]);
        }
    }

    if (catsEnProductos.length > 0) {
        const { data: dataActualizada } = await db.from('categorias').select('*').eq('comercio_id', comercioActualId).order('nombre', { ascending: true });
        categoriasGlobales = dataActualizada || categoriasGlobales;
    }

    poblarSelectoresCategorias(categoriasGlobales);
}

function poblarSelectoresCategorias(lista) {
    const selectProd = document.getElementById('p-categoria-select');
    if (selectProd) {
        selectProd.innerHTML = '';
        lista.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nombre;
            opt.innerText = cat.nombre;
            selectProd.appendChild(opt);
        });
        if (lista.length === 0) {
            selectProd.innerHTML = '<option value="General">General</option>';
        }
    }

    const selectAumento = document.getElementById('aumento-categoria');
    if (selectAumento) {
        selectAumento.innerHTML = '<option value="">Todas las categorías</option>';
        lista.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nombre;
            opt.innerText = cat.nombre;
            selectAumento.appendChild(opt);
        });
    }
}

async function cargarProductos() {
    if (!comercioActualId) return;
    const { data } = await db.from('productos').select('*').eq('comercio_id', comercioActualId).order('id', { ascending: true });

    productosGlobales = data || [];
    renderizarFavoritos(productosGlobales);
    renderizarTablaStock(productosGlobales);
}

function renderizarFavoritos(lista) {
    const contenedor = document.getElementById('contenedor-favoritos');
    contenedor.innerHTML = '';

    const favoritos = lista.filter(p => p.es_favorito === true);

    if (favoritos.length === 0) {
        contenedor.innerHTML = '<div style="color:#888; font-size:13px; grid-column: span 4;">No hay productos rápidos marcados. Editá un producto en "Stock" y tildá "⭐ Mostrar en Botones Rápidos".</div>';
        return;
    }

    favoritos.forEach(prod => {
        const btn = document.createElement('button');
        btn.className = 'btn-favorito';
        btn.onclick = () => solicitarCantidadYAgregar(prod);
        
        let colorStock = '#888';
        if (prod.stock <= 0) colorStock = 'red';
        else if (prod.stock <= (prod.stock_minimo || 3)) colorStock = '#d97706';

        let textoPromo = '';
        if (prod.promo_cant && prod.promo_precio) {
            textoPromo = `<br><span style="background:#d1fae5; color:#065f46; padding:1px 4px; border-radius:3px; font-size:11px; font-weight:bold;">🎁 ${prod.promo_cant}x $${prod.promo_precio}</span>`;
        }

        btn.innerHTML = `
            ${prod.nombre}<br>
            <span style="color:#28a745; font-weight:bold;">$${prod.precio}</span>${textoPromo}<br>
            <small style="color:${colorStock}; font-weight:${prod.stock <= 0 ? 'bold' : 'normal'}; font-size:11px;">
                ${prod.stock <= 0 ? 'SIN STOCK (' + prod.stock + ')' : 'Stock: ' + prod.stock}
            </small>
        `;
        contenedor.appendChild(btn);
    });
}

function renderizarTablaStock(lista) {
    const tbody = document.getElementById('tabla-body-stock');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#888;">No se encontraron productos.</td></tr>';
        return;
    }

    lista.forEach(prod => {
        const stockMin = prod.stock_minimo !== undefined ? prod.stock_minimo : 3;
        let etiquetaStock = '';

        if (prod.stock <= 0) {
            etiquetaStock = `<span style="color:red; font-weight:bold; background:#ffe6e6; padding:2px 6px; border-radius:4px;">⚠️ ${prod.stock} u.</span>`;
        } else if (prod.stock <= stockMin) {
            etiquetaStock = `<span style="color:#d97706; font-weight:bold; background:#fef3c7; padding:2px 6px; border-radius:4px;">⚠️ ${prod.stock} u.</span>`;
        } else {
            etiquetaStock = `<span style="color:green; font-weight:bold;">${prod.stock} u.</span>`;
        }

        let etiquetaPromo = '<span style="color:#aaa;">-</span>';
        if (prod.promo_cant && prod.promo_precio) {
            etiquetaPromo = `<span style="background:#d1fae5; color:#065f46; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:12px;">🎁 ${prod.promo_cant}x por $${prod.promo_precio}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span style="background:#e9ecef; padding:3px 7px; border-radius:4px; font-size:12px;">${prod.categoria || 'General'}</span></td>
            <td><code>${prod.codigo_barras || 'N/A'}</code></td>
            <td><strong>${prod.nombre}</strong></td>
            <td>$${prod.precio}</td>
            <td>${etiquetaPromo}</td>
            <td>${prod.es_favorito ? '⭐ SI' : 'NO'}</td>
            <td>${etiquetaStock}</td>
            <td>
                <button onclick="abrirModalEditar(${prod.id})" style="background:#ffc107; color:#333; border:none; padding:5px 8px; border-radius:3px; cursor:pointer; font-weight:bold; margin-right:5px;">✏️ Editar</button>
                <button onclick="eliminarProducto(${prod.id})" style="background:#dc3545; color:white; border:none; padding:5px 8px; border-radius:3px; cursor:pointer; font-weight:bold;">🗑️ Borrar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
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

/* LÓGICA DE CARRITO Y COMBOS */
function agregarAlCarrito(producto, cantidad = 1) {
    const existe = carrito.find(item => item.id === producto.id);
    if (existe) {
        existe.cantidad += cantidad;
    } else {
        carrito.push({ ...producto, cantidad: cantidad });
    }
    actualizarCarritoUI();
}

function actualizarCarritoUI() {
    const tbody = document.getElementById('carrito-items-body');
    tbody.innerHTML = '';
    totalVentaActual = 0;

    carrito.forEach((item, index) => {
        let subtotal = 0;
        let esPromoAplicada = false;

        if (item.promo_cant && item.promo_precio && item.cantidad >= item.promo_cant) {
            esPromoAplicada = true;
            const combosCompletos = Math.floor(item.cantidad / item.promo_cant);
            const unidadesSueltas = item.cantidad % item.promo_cant;

            subtotal = (combosCompletos * item.promo_precio) + (unidadesSueltas * item.precio);
        } else {
            subtotal = item.precio * item.cantidad;
        }

        totalVentaActual += subtotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.cantidad}x</strong></td>
            <td>
                ${item.nombre}
                ${esPromoAplicada ? '<br><small style="color:#059669; font-weight:bold;">🎁 ¡Promo Combo Aplicada!</small>' : ''}
            </td>
            <td>$${subtotal}</td>
            <td><button class="btn-eliminar" onclick="eliminarDelCarrito(${index})">✕</button></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('total-monto').innerText = totalVentaActual;
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    actualizarCarritoUI();
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
            user_id: usuarioActual.id,
            comercio_id: comercioActualId,
            vendedor_nombre: cajeroActivoNombre,
            monto_total: totalVentaActual,
            medio_pago: medioPagoSeleccionado,
            items: carrito.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio }))
        };

        await db.from('ventas').insert([registroVenta]);

        const opcion = confirm(`¡Venta cobrada por ${cajeroActivoNombre} con éxito!\n\n¿Deseás IMPRIMIR el ticket de compra?`);

        if (opcion) {
            imprimirTicketHTML({
                fecha: new Date().toLocaleString('es-AR'),
                cajero: cajeroActivoNombre,
                medio_pago: medioCopia,
                items: itemsCopia,
                total: totalCopia
            });
        }

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

function imprimirTicketHTML(datosVenta) {
    const divTicket = document.getElementById('ticket-impresion');
    divTicket.className = `formato-${configComercio.formato}`;

    let lineasItems = '';
    datosVenta.items.forEach(item => {
        lineasItems += `
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <span>${item.cantidad}x ${item.nombre.substring(0,20)}</span>
                <span>$${item.precio * item.cantidad}</span>
            </div>
        `;
    });

    divTicket.innerHTML = `
        <div style="text-align:center; font-weight:bold; font-size:15px;">${configComercio.nombre.toUpperCase()}</div>
        <div style="text-align:center; font-size:11px; margin-bottom:6px;">${configComercio.direccion}</div>
        <div style="text-align:center; margin-bottom:6px;">--------------------------------</div>
        <div>Fecha: ${datosVenta.fecha}</div>
        <div>Cajero: ${datosVenta.cajero || 'Dueño'}</div>
        <div>Pago: ${datosVenta.medio_pago}</div>
        <div style="text-align:center;">--------------------------------</div>
        ${lineasItems}
        <div style="text-align:center;">--------------------------------</div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px; margin-top:5px;">
            <span>TOTAL:</span>
            <span>$${datosVenta.total}</span>
        </div>
        <div style="text-align:center; margin-top:15px; font-size:11px;">¡Gracias por su compra!</div>
    `;

    window.print();
}

function enviarTicketWhatsApp(telefono, items, total) {
    let mensaje = `*${configComercio.nombre.toUpperCase()} - Ticket de Compra*\n`;
    mensaje += `_${configComercio.direccion}_\n\n`;
    items.forEach(i => {
        mensaje += `• ${i.cantidad}x ${i.nombre} - $${i.precio * i.cantidad}\n`;
    });
    mensaje += `\n*TOTAL PAGADO: $${total}*\n¡Muchas gracias por tu compra!`;

    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

/* HISTORIAL */
async function cargarHistorialVentas() {
    const tbody = document.getElementById('tabla-body-historial');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando historial...</td></tr>';

    if (!comercioActualId) return;

    const { data } = await db.from('ventas').select('*').eq('comercio_id', comercioActualId).order('id', { ascending: false }).limit(50);

    ventasGlobales = data || [];
    renderizarHistorial(ventasGlobales);
}

function renderizarHistorial(ventas) {
    const tbody = document.getElementById('tabla-body-historial');
    tbody.innerHTML = '';

    if (ventas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">No hay ventas registradas aún.</td></tr>';
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
            <td><span style="background:#e9ecef; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:12px;">${v.vendedor_nombre || 'Dueño'}</span></td>
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
        cajero: venta.vendedor_nombre || 'Dueño',
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

/* MODALES PRODUCTO */
function abrirModalCrear() {
    document.getElementById('modal-titulo-prod').innerText = 'Nuevo Producto';
    document.getElementById('p-id').value = '';
    document.getElementById('p-nombre').value = '';
    document.getElementById('p-categoria-select').value = 'General';
    document.getElementById('p-precio').value = '';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-stock-minimo').value = '3';
    document.getElementById('p-codigo').value = '';

    document.getElementById('p-favorito').checked = false;
    document.getElementById('p-promo-cant').value = '';
    document.getElementById('p-promo-precio').value = '';

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

    document.getElementById('p-favorito').checked = prod.es_favorito || false;
    document.getElementById('p-promo-cant').value = prod.promo_cant || '';
    document.getElementById('p-promo-precio').value = prod.promo_precio || '';

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

    const es_favorito = document.getElementById('p-favorito').checked;
    const promo_cant = Number(document.getElementById('p-promo-cant').value) || null;
    const promo_precio = Number(document.getElementById('p-promo-precio').value) || null;

    if (!nombre || !precio) return alert("Completá nombre y precio.");

    const datos = {
        user_id: usuarioActual.id,
        comercio_id: comercioActualId,
        nombre,
        categoria,
        precio,
        stock: isNaN(stock) ? 0 : stock,
        stock_minimo: isNaN(stockMin) ? 3 : stockMin,
        codigo_barras: codigo || null,
        es_favorito,
        promo_cant,
        promo_precio
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
        await cargarCategorias();
        await cargarProductos();
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

    const { error } = await db.from('categorias').insert([{ user_id: usuarioActual.id, comercio_id: comercioActualId, nombre }]);

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
    btn.innerText = "Cargando...";

    lector.onload = async function(e) {
        try {
            const lineas = e.target.result.split('\n');
            const nuevosProductos = [];

            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;

                const columnas = linea.split(',');
                if (columnas.length >= 3) {
                    const nombre = columnas[0]?.replace(/"/g, '').trim();
                    const categoria = columnas[1]?.replace(/"/g, '').trim() || 'General';
                    const precio = Number(columnas[2]?.replace(/"/g, '').trim());
                    const stock = Number(columnas[3]?.replace(/"/g, '').trim()) || 0;
                    const codigo = columnas[4]?.replace(/"/g, '').trim() || null;

                    if (nombre && !isNaN(precio)) {
                        nuevosProductos.push({
                            user_id: usuarioActual.id,
                            comercio_id: comercioActualId,
                            nombre: nombre,
                            categoria: categoria,
                            precio: precio,
                            stock: stock,
                            stock_minimo: 3,
                            codigo_barras: codigo ? String(codigo) : null
                        });
                    }
                }
            }

            if (nuevosProductos.length === 0) {
                alert("⚠️ No se encontraron productos válidos en el archivo.");
                btn.disabled = false;
                btn.innerText = "🚀 Cargar Productos";
                return;
            }

            const { error } = await db.from('productos').insert(nuevosProductos);

            if (error) {
                alert("⚠️ Error al guardar: " + error.message);
            } else {
                alert(`¡Se importaron ${nuevosProductos.length} productos con éxito!`);
                cerrarModalImportar();
                await cargarCategorias();
                await cargarProductos();
            }
        } catch (err) {
            alert("Error al procesar el archivo CSV: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "🚀 Cargar Productos";
        }
    };

    lector.readAsText(archivo);
}