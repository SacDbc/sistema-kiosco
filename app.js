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

let cajaActualId = null;
let fondoInicialActual = 0;
let cajaAperturaTimestamp = null; // Control estricto de la hora de apertura del turno

let configComercio = {
    nombre: localStorage.getItem('cfg_nombre') || 'Kiosco En Línea',
    direccion: localStorage.getItem('cfg_direccion') || 'Atención al Cliente',
    formato: localStorage.getItem('cfg_formato') || '80mm',
    pinDueno: '0000'
};

/* --- SISTEMA DE DIÁLOGOS MODERNOS (REEMPLAZO DE ALERT/CONFIRM/PROMPT) --- */
function mostrarAlerta(mensaje, titulo = "Aviso") {
    return new Promise((resolve) => {
        document.getElementById('titulo-alerta').innerText = titulo;
        document.getElementById('mensaje-alerta').innerText = mensaje;
        document.getElementById('modal-sistema-alerta').style.display = 'flex';
        window._resolveAlerta = () => {
            document.getElementById('modal-sistema-alerta').style.display = 'none';
            resolve();
        };
    });
}
function cerrarAlertaCustom() {
    if (window._resolveAlerta) window._resolveAlerta();
}

function mostrarConfirmacion(mensaje, titulo = "Confirmación") {
    return new Promise((resolve) => {
        document.getElementById('titulo-confirmar').innerText = titulo;
        document.getElementById('mensaje-confirmar').innerText = mensaje;
        document.getElementById('modal-sistema-confirmar').style.display = 'flex';
        
        const btnSi = document.getElementById('btn-confirmar-si');
        btnSi.onclick = () => {
            document.getElementById('modal-sistema-confirmar').style.display = 'none';
            resolve(true);
        };
        window._resolveConfirm = (val) => {
            document.getElementById('modal-sistema-confirmar').style.display = 'none';
            resolve(val);
        };
    });
}
function cerrarConfirmarCustom(val) {
    if (window._resolveConfirm) window._resolveConfirm(val);
}

function mostrarPrompt(mensaje, titulo = "Ingreso de Datos", valorInicial = "") {
    return new Promise((resolve) => {
        document.getElementById('titulo-prompt').innerText = titulo;
        document.getElementById('mensaje-prompt').innerText = mensaje;
        const input = document.getElementById('input-prompt-valor');
        input.value = valorInicial;
        document.getElementById('modal-sistema-prompt').style.display = 'flex';
        setTimeout(() => input.focus(), 100);

        const btnAceptar = document.getElementById('btn-prompt-aceptar');
        btnAceptar.onclick = () => {
            const val = input.value;
            document.getElementById('modal-sistema-prompt').style.display = 'none';
            resolve(val);
        };
        
        window._resolvePrompt = (val) => {
            document.getElementById('modal-sistema-prompt').style.display = 'none';
            resolve(val);
        };
    });
}
function cerrarPromptCustom(val) {
    if (window._resolvePrompt) window._resolvePrompt(val);
}
/* --------------------------------------------------------------------- */

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
        document.getElementById('pantalla-login').style.display = 'none';
        document.getElementById('pantalla-bloqueo').style.display = 'flex';
        document.getElementById('titulo-bloqueo').innerText = "Comercio no Vinculado";
        document.getElementById('mensaje-bloqueo').innerText = "Tu usuario no tiene un comercio asociado. Contactate con administración.";
        document.getElementById('app-principal').style.display = 'none';
        return;
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
            await mostrarAlerta("Ingresá el nombre de tu comercio.");
            btn.disabled = false;
            btn.innerText = 'Registrar Comercio';
            return;
        }

        const { data: perfilExistente } = await db.from('perfiles').select('id, email, comercio_id').eq('email', email).maybeSingle();

        if (perfilExistente && perfilExistente.comercio_id) {
            await mostrarAlerta("⚠️ Este correo ya tiene un comercio registrado. Iniciá sesión con tu cuenta.");
            btn.disabled = false;
            btn.innerText = 'Registrar Comercio';
            return;
        }

        const { data: authData, error: authError } = await db.auth.signUp({ email, password });
        let userId = authData?.user?.id;

        if (authError && authError.message.includes("already registered")) {
            const { data: loginData, error: loginError } = await db.auth.signInWithPassword({ email, password });
            if (loginError) {
                await mostrarAlerta("⚠️ Este correo ya está registrado. Ingresá tu contraseña correcta o contactate con administración.");
                btn.disabled = false;
                btn.innerText = 'Registrar Comercio';
                return;
            }
            userId = loginData.user.id;
        } else if (authError) {
            await mostrarAlerta("Error al registrar: " + authError.message);
            btn.disabled = false;
            btn.innerText = 'Registrar Comercio';
            return;
        }

        if (userId) {
            const { data: comercioCreado, error: comError } = await db.from('comercios').insert([{
                nombre_comercio: nombreComercio,
                dueno_id: userId,
                estado_suscripcion: 'pendiente'
            }]).select().single();

            if (!comError && comercioCreado) {
                await db.from('perfiles').upsert([{
                    user_id: userId,
                    email: email,
                    rol: 'dueno',
                    comercio_id: comercioCreado.id
                }], { onConflict: 'user_id' });

                localStorage.setItem('cfg_nombre', nombreComercio);
            }

            await mostrarAlerta("¡Registro enviado con éxito! El administrador habilitará tu cuenta en breve.");
            await db.auth.signOut();
            location.reload();
        }
    } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) await mostrarAlerta("Credenciales incorrectas: " + error.message);
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

async function confirmarIngresoTurno() {
    const pin = document.getElementById('input-pin-apertura').value.trim();
    if (cajeroSeleccionadoTemp && cajeroSeleccionadoTemp.pin === pin) {
        cajeroActivoNombre = cajeroSeleccionadoTemp.nombre;
        cajeroActivoObjeto = cajeroSeleccionadoTemp;
        
        actualizarNombreCajeroUI();
        aplicarPermisosVisuales();
        document.getElementById('pantalla-apertura-turno').style.display = 'none';
        
        verificarOForzarAperturaCaja();
    } else {
        await mostrarAlerta("⚠️ PIN Incorrecto.");
    }
}

async function ingresarComoDuenoDirecto() {
    const pin = await mostrarPrompt("Ingresá tu PIN de Dueño / Administrador:", "Área Protegida");
    if (pin === configComercio.pinDueno) {
        cajeroActivoNombre = 'Dueño';
        cajeroActivoObjeto = null;
        actualizarNombreCajeroUI();
        aplicarPermisosVisuales();
        document.getElementById('pantalla-apertura-turno').style.display = 'none';
        
        cambiarPestaña('ventas');
    } else if (pin !== null && pin !== "") {
        await mostrarAlerta("⚠️ PIN de Dueño incorrecto.");
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

async function intentarAccesoProtegido(tab) {
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
        const pin = await mostrarPrompt(`🔒 Área protegida. Ingresá el PIN de Dueño para acceder a ${tab.toUpperCase()}:`, "Seguridad");
        if (pin === configComercio.pinDueno) {
            if (tab === 'config') abrirModalConfig();
            else cambiarPestaña(tab);
        } else if (pin !== null && pin !== "") {
            await mostrarAlerta("⚠️ Acceso denegado. PIN de Dueño incorrecto.");
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

    if (!nombre || !pin) {
        await mostrarAlerta("Completá el nombre y el PIN numérico.");
        return;
    }

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
        await mostrarAlerta("Error al guardar vendedor.");
    } else {
        await mostrarAlerta("¡Vendedor guardado con éxito!");
        cerrarModalVendedor();
        await cargarVendedores();
    }
}

async function eliminarVendedor(id) {
    const aceptar = await mostrarConfirmacion("¿Eliminar a este vendedor?");
    if (aceptar) {
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

async function cambiarPestaña(tab) {
    document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('activo'));

    if (tab === 'ventas') {
        document.getElementById('seccion-ventas').classList.add('activa');
        document.getElementById('btn-tab-ventas').classList.add('activo');
        
        await verificarOForzarAperturaCajaEnVentas();
        await actualizarResumenVentasPOS();
        
    } else if (tab === 'stock') {
        document.getElementById('seccion-stock').classList.add('activa');
        document.getElementById('btn-tab-stock').classList.add('activo');
        cargarCategorias(); 
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

async function guardarConfiguracion() {
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
    await mostrarAlerta("¡Configuración guardada correctamente!");
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
                ${estado === 'activo' ? `<button onclick="cambiarEstadoComercio(${c.id}, 'vencido')" style="background:#dc3545; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:5px;">🚫 Suspender</button>` : ''}
                ${estado === 'vencido' ? `<button onclick="cambiarEstadoComercio(${c.id}, 'activo')" style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; margin-right:5px;">⚡ Reactivar</button>` : ''}
                <button onclick="eliminarComercioAdmin(${c.id}, '${c.nombre_comercio}')" style="background:#343a40; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">🗑️ Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

async function cambiarEstadoComercio(idComercio, nuevoEstado) {
    await db.from('comercios').update({ estado_suscripcion: nuevoEstado }).eq('id', idComercio);
    await mostrarAlerta(`Estado del comercio actualizado a: ${nuevoEstado.toUpperCase()}`);
    cargarTablaAdmin();
}

async function cargarCategorias() {
    if (!comercioActualId) return;

    let { data, error } = await db.from('categorias').select('*').eq('comercio_id', comercioActualId).order('nombre', { ascending: true });

    if (error) {
        console.error("Error al cargar categorías:", error);
    }

    categoriasGlobales = data || [];

    if (categoriasGlobales.length === 0) {
        categoriasGlobales = [{ nombre: 'General' }];
    }

    poblarSelectoresCategorias(categoriasGlobales);
    renderizarListaCategoriasModal();
}

function poblarSelectoresCategorias(lista) {
    const categoriasValidas = (lista && lista.length > 0) ? lista : [{ nombre: 'General' }];

    const selectProd = document.getElementById('p-categoria-select');
    if (selectProd) {
        const valorActual = selectProd.value;
        selectProd.innerHTML = '';
        
        categoriasValidas.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nombre;
            opt.innerText = cat.nombre;
            selectProd.appendChild(opt);
        });

        if (valorActual) {
            selectProd.value = valorActual;
        }
    }

    const selectAumento = document.getElementById('aumento-categoria');
    if (selectAumento) {
        const valorActualAumento = selectAumento.value;
        selectAumento.innerHTML = '<option value="">Todas las categorías</option>';
        
        categoriasValidas.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nombre;
            opt.innerText = cat.nombre;
            selectAumento.appendChild(opt);
        });

        if (valorActualAumento) selectAumento.value = valorActualAumento;
    }
}

async function cargarProductos() {
    if (!comercioActualId) return;
    const { data } = await db.from('productos').select('*').eq('comercio_id', comercioActualId).order('id', { ascending: true });

    productosGlobales = data || [];
    
    await cargarCategorias();

    renderizarFavoritos(productosGlobales);
    renderizarTablaStock(productosGlobales);
}

function renderizarFavoritos(lista) {
    const contenedor = document.getElementById('contenedor-favoritos');
    if (!contenedor) return;
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
    if (!cajaActualId) {
        abrirModalAperturaCaja();
        return;
    }	
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
    if (!tbody) return;
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

async function solicitarCantidadYAgregar(producto) {
    let cant = await mostrarPrompt(`¿Cuántas unidades de "${producto.nombre}" deseas agregar?`, "Cantidad", "1");
    if (cant !== null && cant !== "") {
        cant = parseInt(cant);
        if (!isNaN(cant) && cant > 0) {
            agregarAlCarrito(producto, cant);
        }
    }
}

function abrirModalCobro() {
    if (!cajaActualId) {
        abrirModalAperturaCaja();
        return;
    }
    if (carrito.length === 0) {
        mostrarAlerta("El carrito está vacío.");
        return;
    }

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
            await mostrarAlerta("⚠️ El monto recibido en efectivo es menor al total a pagar.");
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

        const opcion = await mostrarConfirmacion(`¡Venta cobrada por ${cajeroActivoNombre} con éxito!\n\n¿Deseás IMPRIMIR el ticket de compra?`, "Venta Exitosa");

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
        await actualizarResumenVentasPOS();
    } catch (e) {
        await mostrarAlerta("Error al procesar el cobro.");
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

    const { data: cajaAbierta } = await db.from('cajas')
        .select('*')
        .eq('comercio_id', comercioActualId)
        .eq('estado', 'abierta')
        .order('id', { ascending: false })
        .maybeSingle();

    const timestampApertura = cajaAbierta ? cajaAbierta.created_at : null;

    const { data: ventasRecientes } = await db.from('ventas')
        .select('*')
        .eq('comercio_id', comercioActualId)
        .order('id', { ascending: false })
        .limit(50);

    ventasGlobales = ventasRecientes || [];
    renderizarTablaHistorialReciente(ventasGlobales);

    let queryVentasTurno = db.from('ventas')
        .select('*')
        .eq('comercio_id', comercioActualId);

    if (timestampApertura) {
        queryVentasTurno = queryVentasTurno.gte('created_at', timestampApertura);
    }

    const { data: ventasDelTurno } = await queryVentasTurno;
    calcularYMostrarTotalesTurnoActual(ventasDelTurno || []);

    await cargarHistorialCierres();
}

function renderizarTablaHistorialReciente(ventas) {
    const tbody = document.getElementById('tabla-body-historial');
    tbody.innerHTML = '';

    if (ventas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">No hay ventas registradas aún.</td></tr>';
        return;
    }

    ventas.forEach(v => {
        const monto = Number(v.monto_total) || 0;
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
}

function calcularYMostrarTotalesTurnoActual(ventasTurno) {
    let total = 0, efectivo = 0, qr = 0, transf = 0;

    ventasTurno.forEach(v => {
        const monto = Number(v.monto_total) || 0;
        total += monto;

        if (v.medio_pago === 'Efectivo') efectivo += monto;
        else if (v.medio_pago === 'QR') qr += monto;
        else if (v.medio_pago === 'Transferencia') transf += monto;
    });

    actualizarTotalesCaja(total, efectivo, qr, transf);
}

function actualizarTotalesCaja(total, efectivo, qr, transf) {
    document.getElementById('caja-total').innerText = `$${total}`;
    document.getElementById('caja-efectivo').innerText = `$${efectivo}`;
    document.getElementById('caja-qr').innerText = `$${qr}`;
    document.getElementById('caja-transf').innerText = `$${transf}`;
}

async function actualizarResumenVentasPOS() {
    if (!comercioActualId) return;

    let queryVentas = db.from('ventas')
        .select('*')
        .eq('comercio_id', comercioActualId);

    if (cajaAperturaTimestamp) {
        queryVentas = queryVentas.gte('created_at', cajaAperturaTimestamp);
    } else {
        actualizarTotalesPOSUI(0, 0, 0, 0);
        return;
    }

    const { data: ventasTurno } = await queryVentas;

    let total = 0, efectivo = 0, qr = 0, transf = 0;
    (ventasTurno || []).forEach(v => {
        const monto = Number(v.monto_total) || 0;
        total += monto;

        if (v.medio_pago === 'Efectivo') efectivo += monto;
        else if (v.medio_pago === 'QR') qr += monto;
        else if (v.medio_pago === 'Transferencia') transf += monto;
    });

    actualizarTotalesPOSUI(total, efectivo, qr, transf);
}

function actualizarTotalesPOSUI(total, efectivo, qr, transf) {
    const elTotal = document.getElementById('pos-caja-total');
    const elEfectivo = document.getElementById('pos-caja-efectivo');
    const elQr = document.getElementById('pos-caja-qr');
    const elTransf = document.getElementById('pos-caja-transf');

    if (elTotal) elTotal.innerText = `$${total}`;
    if (elEfectivo) elEfectivo.innerText = `$${efectivo}`;
    if (elQr) elQr.innerText = `$${qr}`;
    if (elTransf) elTransf.innerText = `$${transf}`;
}

/* MODALES PRODUCTO */
async function abrirModalCrear() {
    await cargarCategorias();
    document.getElementById('modal-titulo-prod').innerText = 'Nuevo Producto';
    document.getElementById('p-id').value = '';
    document.getElementById('p-nombre').value = '';
    
    const selectCat = document.getElementById('p-categoria-select');
    if (selectCat && selectCat.options.length > 0) selectCat.selectedIndex = 0;

    document.getElementById('p-precio').value = '';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-stock-minimo').value = '3';
    document.getElementById('p-codigo').value = '';

    document.getElementById('p-favorito').checked = false;
    document.getElementById('p-promo-cant').value = '';
    document.getElementById('p-promo-precio').value = '';

    document.getElementById('modal-producto').style.display = 'flex';
}

async function abrirModalEditar(id) {
    await cargarCategorias();
    const prod = productosGlobales.find(p => p.id === id);
    if (!prod) return;

    document.getElementById('modal-titulo-prod').innerText = 'Editar Producto';
    document.getElementById('p-id').value = prod.id;
    document.getElementById('p-nombre').value = prod.nombre;
    
    const selectCat = document.getElementById('p-categoria-select');
    if (selectCat) {
        selectCat.value = prod.categoria || 'General';
    }

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

    if (!nombre || !precio) {
        await mostrarAlerta("Completá nombre y precio.");
        return;
    }

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

    if (error) {
        await mostrarAlerta("Error al guardar en la base de datos.");
    } else {
        await mostrarAlerta("¡Producto guardado exitosamente!");
        cerrarModal();
        await cargarCategorias();
        await cargarProductos();
    }
}

async function eliminarProducto(id) {
    const prod = productosGlobales.find(p => p.id === id);
    if (!prod) return;

    const aceptar = await mostrarConfirmacion(`¿Estás seguro de eliminar "${prod.nombre}"?`);
    if (aceptar) {
        const { error } = await db.from('productos').delete().eq('id', id);
        if (error) {
            await mostrarAlerta("Error al eliminar.");
        } else {
            await mostrarAlerta("Producto eliminado.");
            await cargarProductos();
        }
    }
}

/* CATEGORÍAS */
async function abrirModalCategorias() {
    await cargarCategorias();
    renderizarListaCategoriasModal();
    document.getElementById('modal-categorias').style.display = 'flex';
}

function cerrarModalCategorias() {
    document.getElementById('modal-categorias').style.display = 'none';
}

function renderizarListaCategoriasModal() {
    const listaUI = document.getElementById('lista-categorias-modal');
    if (!listaUI) return;
    listaUI.innerHTML = '';

    if (categoriasGlobales.length === 0) {
        listaUI.innerHTML = '<li style="padding:10px; text-align:center; color:#888;">No hay categorías creadas.</li>';
        return;
    }

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
    if (!nombre) {
        await mostrarAlerta("Ingresá un nombre de categoría.");
        return;
    }

    const { data: existente } = await db.from('categorias')
        .select('id')
        .eq('comercio_id', comercioActualId)
        .ilike('nombre', nombre)
        .maybeSingle();

    if (existente) {
        await mostrarAlerta("⚠️ La categoría ya existe.");
        return;
    }

    const { error } = await db.from('categorias').insert([{ 
        user_id: usuarioActual ? usuarioActual.id : null, 
        comercio_id: comercioActualId, 
        nombre 
    }]);

    if (error) {
        console.error("Error al guardar categoría:", error);
        await mostrarAlerta("No se pudo guardar la categoría: " + error.message);
    } else {
        document.getElementById('nueva-cat-nombre').value = '';
        await cargarCategorias();
        renderizarListaCategoriasModal();
    }
}

/* AUMENTO MASIVO */
async function aplicarAumentoMasivo() {
    const categoriaSel = document.getElementById('aumento-categoria').value;
    const porcentaje = Number(document.getElementById('aumento-porcentaje').value);
    const redondear = document.getElementById('chk-redondear').checked;

    if (!porcentaje || porcentaje <= 0) {
        await mostrarAlerta("Ingresá un porcentaje de aumento válido.");
        return;
    }

    const aActualizar = productosGlobales.filter(p => !categoriaSel || (p.categoria || 'General') === categoriaSel);
    if (aActualizar.length === 0) {
        await mostrarAlerta("No hay productos en la categoría seleccionada.");
        return;
    }

    const aceptar = await mostrarConfirmacion(`¿Confirmás aumentar un ${porcentaje}%?`);
    if (!aceptar) return;

    for (const prod of aActualizar) {
        let nuevoPrecio = prod.precio * (1 + (porcentaje / 100));

        if (redondear) {
            nuevoPrecio = Math.ceil(nuevoPrecio / 100) * 100;
        } else {
            nuevoPrecio = Math.round(nuevoPrecio);
        }

        await db.from('productos').update({ precio: nuevoPrecio }).eq('id', prod.id);
    }

    await mostrarAlerta("¡Aumento masivo aplicado con éxito!");
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
    if (!input.files || input.files.length === 0) {
        await mostrarAlerta("Por favor seleccioná un archivo CSV.");
        return;
    }

    const archivo = input.files[0];
    const lector = new FileReader();

    const btn = document.getElementById('btn-procesar-importacion');
    btn.disabled = true;
    btn.innerText = "Analizando categorías...";

    lector.onload = async function(e) {
        try {
            const contenido = e.target.result;
            const lineas = contenido.split(/\r\n|\n/);
            const filasValidas = [];
            const categoriasSet = new Set();

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
                        categoriasSet.add(categoria);
                        filasValidas.push({
                            nombre,
                            categoria,
                            precio,
                            stock,
                            codigo_barras: codigo ? String(codigo) : null
                        });
                    }
                }
            }

            if (filasValidas.length === 0) {
                await mostrarAlerta("⚠️ No se encontraron productos válidos en el archivo.");
                btn.disabled = false;
                btn.innerText = "🚀 Cargar Productos";
                return;
            }

            btn.innerText = "Registrando categorías...";
            for (const catNombre of categoriasSet) {
                const { data: existente } = await db.from('categorias')
                    .select('id')
                    .eq('comercio_id', comercioActualId)
                    .eq('nombre', catNombre)
                    .maybeSingle();

                if (!existente) {
                    const { error: errCat } = await db.from('categorias').insert([{ 
                        user_id: usuarioActual ? usuarioActual.id : null, 
                        comercio_id: comercioActualId, 
                        nombre: catNombre 
                    }]);

                    if (errCat) {
                        console.error(`No se pudo crear la categoría ${catNombre}:`, errCat.message);
                    }
                }
            }

            btn.innerText = "Actualizando inventario...";
            
            for (const p of filasValidas) {
                let query = db.from('productos')
                    .select('id')
                    .eq('comercio_id', comercioActualId);

                if (p.codigo_barras) {
                    query = query.eq('codigo_barras', p.codigo_barras);
                } else {
                    query = query.eq('nombre', p.nombre);
                }

                const { data: prodExistente } = await query.maybeSingle();

                const datosProducto = {
                    user_id: usuarioActual.id,
                    comercio_id: comercioActualId,
                    nombre: p.nombre,
                    categoria: p.categoria,
                    precio: p.precio,
                    stock: p.stock,
                    stock_minimo: 3,
                    codigo_barras: p.codigo_barras
                };

                if (prodExistente) {
                    await db.from('productos').update(datosProducto).eq('id', prodExistente.id);
                } else {
                    await db.from('productos').insert([datosProducto]);
                }
            }

            await mostrarAlerta(`¡Importación procesada con éxito! Los productos nuevos fueron agregados y los existentes se actualizaron correctamente.`);
            cerrarModalImportar();
            
            await cargarCategorias();
            await cargarProductos();
            renderizarTablaStock(productosGlobales);
        } catch (err) {
            await mostrarAlerta("Error al procesar el archivo CSV: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "🚀 Cargar Productos";
        }
    };

    lector.readAsText(archivo);
}

async function eliminarComercioAdmin(idComercio, nombreComercio) {
    const aceptar = await mostrarConfirmacion(`⚠️ ¿Estás seguro de eliminar por completo el comercio "${nombreComercio}" y todos sus datos asociados? Esta acción no se puede deshacer.`, "Peligro");
    if (aceptar) {
        await db.from('perfiles').update({ comercio_id: null }).eq('comercio_id', idComercio);
        const { error } = await db.from('comercios').delete().eq('id', idComercio);
        
        if (error) {
            await mostrarAlerta("Error al eliminar el comercio: " + error.message);
        } else {
            await mostrarAlerta(`El comercio "${nombreComercio}" fue eliminado correctamente.`);
            cargarTablaAdmin();
            cargarComerciosSoporte();
        }
    }
}

function filtrarStockBajo() {
    const btn = document.querySelector('button[onclick="filtrarStockBajo()"]');
    if (!btn) return;
    
    mostrandoSoloBajoStock = !mostrandoSoloBajoStock;

    if (mostrandoSoloBajoStock) {
        btn.style.background = '#dc3545';
        btn.style.color = 'white';
        btn.innerText = "📦 Ver Todo el Stock";

        const filtrados = productosGlobales.filter(p => {
            const stockMin = p.stock_minimo !== undefined ? p.stock_minimo : 3;
            return p.stock <= stockMin && p.comercio_id === comercioActualId;
        });
        renderizarTablaStock(filtrados);
    } else {
        btn.style.background = '#ffc107';
        btn.style.color = '#333';
        btn.innerText = "⚠️ Ver Bajo Stock / Reponer";
        renderizarTablaStock(productosGlobales);
    }
}

async function exportarProductosCSV() {
    if (!comercioActualId) {
        await mostrarAlerta("⚠️ No hay un comercio seleccionado para exportar.");
        return;
    }

    const productosDelComercio = productosGlobales.filter(p => p.comercio_id === comercioActualId);

    if (productosDelComercio.length === 0) {
        await mostrarAlerta("⚠️ No hay productos en el inventario de este comercio para exportar.");
        return;
    }

    let csvContent = "nombre,categoria,precio,stock,stock_minimo,codigo_barras\n";

    productosDelComercio.forEach(p => {
        const nombre = `"${(p.nombre || '').replace(/"/g, '""')}"`;
        const categoria = `"${(p.categoria || 'General').replace(/"/g, '""')}"`;
        const precio = p.precio || 0;
        const stock = p.stock || 0;
        const stockMin = p.stock_minimo !== undefined ? p.stock_minimo : 3;
        const codigo = p.codigo_barras ? `"${p.codigo_barras}"` : '""';

        csvContent += `${nombre},${categoria},${precio},${stock},${stockMin},${codigo}\n`;
    });

    const nombreLimpio = (configComercio.nombre || `comercio_${comercioActualId}`)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_${nombreLimpio}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* APERTURA Y ARQUEO DE CAJA */
function abrirModalAperturaCaja() {
    document.getElementById('input-fondo-inicial').value = '';
    
    const btnDuenoCajaCerrada = document.getElementById('btn-ingresar-caja-cerrada');
    if (btnDuenoCajaCerrada) {
        if (cajeroActivoNombre === 'Dueño') {
            btnDuenoCajaCerrada.style.display = 'block';
        } else {
            btnDuenoCajaCerrada.style.display = 'none';
        }
    }

    document.getElementById('modal-apertura-caja').style.display = 'flex';
    setTimeout(() => document.getElementById('input-fondo-inicial').focus(), 100);
}

function ingresarConCajaCerradaPorDueno() {
    if (cajeroActivoNombre !== 'Dueño') return;
    document.getElementById('modal-apertura-caja').style.display = 'none';
    
    const inputBuscador = document.getElementById('buscador');
    if (inputBuscador) {
        inputBuscador.disabled = false;
        inputBuscador.placeholder = "⚡ (Caja Cerrada) Pistoleá código o busca...";
        inputBuscador.focus();
    }
}

async function confirmarAperturaCajaOficial() {
    const inputFondo = document.getElementById('input-fondo-inicial');
    if (inputFondo.value === "") {
        await mostrarAlerta("⚠️ Por favor ingresá un monto para el fondo inicial (puedes poner 0 si no hay efectivo).");
        inputFondo.focus();
        return;
    }

    const fondo = Number(inputFondo.value) || 0;
    fondoInicialActual = fondo;

    await db.from('cajas')
        .update({ estado: 'cerrada', closed_at: new Date().toISOString(), observaciones: 'Cierre automático por apertura de nueva caja' })
        .eq('comercio_id', comercioActualId)
        .eq('estado', 'abierta');

    const datosCaja = {
        comercio_id: comercioActualId,
        vendedor_nombre: cajeroActivoNombre,
        monto_inicial: fondo,
        estado: 'abierta'
    };

    const { data, error } = await db.from('cajas').insert([datosCaja]).select().single();

    if (error) {
        await mostrarAlerta("Error al abrir la caja: " + error.message);
    } else {
        cajaActualId = data.id;
        cajaAperturaTimestamp = data.created_at;
        
        document.getElementById('modal-apertura-caja').style.display = 'none';
        
        const inputBuscador = document.getElementById('buscador');
        if (inputBuscador) {
            inputBuscador.disabled = false;
            inputBuscador.placeholder = "⚡ Pistoleá código o busca (ej: 5*codigo)...";
            inputBuscador.focus();
        }

        await actualizarResumenVentasPOS();
        await mostrarAlerta(`¡Caja abierta con éxito por ${cajeroActivoNombre} con un fondo de $${fondo}!`);
    }
}

async function abrirModalCierreCaja() {
    let cajaAbierta = null;

    if (!cajaActualId) {
        const { data: abierta } = await db.from('cajas')
            .select('*')
            .eq('comercio_id', comercioActualId)
            .eq('estado', 'abierta')
            .order('id', { ascending: false })
            .maybeSingle();

        if (abierta) {
            cajaAbierta = abierta;
            cajaActualId = abierta.id;
            fondoInicialActual = abierta.monto_inicial || 0;
            cajaAperturaTimestamp = abierta.created_at;
        } else {
            fondoInicialActual = 0;
        }
    } else {
        const { data: abierta } = await db.from('cajas')
            .select('*')
            .eq('id', cajaActualId)
            .maybeSingle();
        if (abierta) {
            cajaAbierta = abierta;
            cajaAperturaTimestamp = abierta.created_at;
            fondoInicialActual = abierta.monto_inicial || 0;
        }
    }

    let queryVentas = db.from('ventas')
        .select('*')
        .eq('comercio_id', comercioActualId);

    if (cajaAperturaTimestamp) {
        queryVentas = queryVentas.gte('created_at', cajaAperturaTimestamp);
    }

    const { data: ventasTurno } = await queryVentas;

    let tEfectivo = 0, tQr = 0, tTransf = 0;
    (ventasTurno || []).forEach(v => {
        const monto = Number(v.monto_total) || 0;
        if (v.medio_pago === 'Efectivo') tEfectivo += monto;
        else if (v.medio_pago === 'QR') tQr += monto;
        else if (v.medio_pago === 'Transferencia') tTransf += monto;
    });

    window.tempTotalesTurno = { efectivo: tEfectivo, qr: tQr, transferencia: tTransf };
    let retirosEfectivo = 0; 

    const efectivoEsperado = fondoInicialActual + tEfectivo - retirosEfectivo;

    document.getElementById('cierre-cajero').innerText = cajeroActivoNombre;
    document.getElementById('cierre-fondo').innerText = `$${fondoInicialActual}`;
    document.getElementById('cierre-ventas-efectivo').innerText = `$${tEfectivo}`;
    document.getElementById('cierre-retiros').innerText = `$${retirosEfectivo}`;
    document.getElementById('cierre-esperado').innerText = `$${efectivoEsperado}`;
    
    document.getElementById('input-dinero-fisico').value = '';
    document.getElementById('cierre-diferencia').innerText = '$0';
    document.getElementById('input-obs-cierre').value = '';

    window.tempEfectivoEsperado = efectivoEsperado;
    document.getElementById('modal-cierre-caja').style.display = 'flex';
    setTimeout(() => document.getElementById('input-dinero-fisico').focus(), 100);
}

function cerrarModalCierreCaja() {
    document.getElementById('modal-cierre-caja').style.display = 'none';
}

function calcularDiferenciaArqueo() {
    const fisico = Number(document.getElementById('input-dinero-fisico').value) || 0;
    const esperado = window.tempEfectivoEsperado || 0;
    const diferencia = fisico - esperado;

    const elDiferencia = document.getElementById('cierre-diferencia');
    elDiferencia.innerText = `$${diferencia}`;
    if (diferencia === 0) {
        elDiferencia.style.color = 'green';
        elDiferencia.innerText += ' (¡Perfecto!)';
    } else if (diferencia > 0) {
        elDiferencia.style.color = 'blue';
        elDiferencia.innerText += ` (Sobrante de $${diferencia})`;
    } else {
        elDiferencia.style.color = 'red';
        elDiferencia.innerText += ` (Faltante de $${Math.abs(diferencia)})`;
    }
}

async function confirmarCierreCajaOficial(conDetalle = false) {
    const fisico = Number(document.getElementById('input-dinero-fisico').value) || 0;
    const esperado = window.tempEfectivoEsperado || 0;
    const diferencia = fisico - esperado;
    const observaciones = document.getElementById('input-obs-cierre').value.trim();
    const totales = window.tempTotalesTurno || { efectivo: 0, qr: 0, transferencia: 0 };
    const totalGeneral = totales.efectivo + totales.qr + totales.transferencia;

    if (cajaActualId) {
        await db.from('cajas').update({
            monto_final_declarado: fisico,
            total_efectivo: totales.efectivo,
            total_qr: totales.qr,
            total_transferencia: totales.transferencia,
            total_general: totalGeneral,
            diferencia: diferencia,
            estado: 'cerrada',
            observaciones: observaciones,
            closed_at: new Date().toISOString()
        }).eq('id', cajaActualId);
    }

    await mostrarAlerta("¡Caja cerrada y arqueo guardado con éxito!");
    cerrarModalCierreCaja();

    imprimirTicketCierreHTML({
        fecha: new Date().toLocaleString('es-AR'),
        cajero: cajeroActivoNombre,
        fondoInicial: fondoInicialActual,
        efectivoVentas: totales.efectivo,
        qrVentas: totales.qr,
        transfVentas: totales.transferencia,
        totalGeneral: totalGeneral,
        efectivoEsperado: esperado,
        efectivoFisico: fisico,
        diferencia: diferencia,
        observaciones: observaciones,
        conDetalle: conDetalle
    });

    cajaActualId = null;
    cajaAperturaTimestamp = null;
}

function imprimirTicketCierreHTML(datos) {
    const divTicket = document.getElementById('ticket-impresion');
    if (!divTicket) return;
    divTicket.className = `formato-${configComercio.formato}`;

    divTicket.innerHTML = `
        <div style="text-align:center; font-weight:bold; font-size:16px;">${configComercio.nombre.toUpperCase()}</div>
        <div style="text-align:center; font-size:12px; font-weight:bold;">REPORTE DE CIERRE DE CAJA</div>
        <div style="text-align:center; font-size:11px; margin-bottom:6px;">${configComercio.direccion}</div>
        <div style="text-align:center; margin-bottom:6px;">--------------------------------</div>
        <div>Fecha: ${datos.fecha}</div>
        <div>Cajero: ${datos.cajero}</div>
        <div style="text-align:center;">--------------------------------</div>
        <div>Fondo Inicial: $${datos.fondoInicial}</div>
        <div>Ventas Efectivo: $${datos.efectivoVentas}</div>
        <div>Ventas QR: $${datos.qrVentas}</div>
        <div>Ventas Transferencia: $${datos.transfVentas}</div>
        <div style="font-weight:bold; margin-top:4px;">TOTAL VENTAS: $${datos.totalGeneral}</div>
        <div style="text-align:center;">--------------------------------</div>
        <div>Efectivo Esperado: $${datos.efectivoEsperado}</div>
        <div>Efectivo Contado: $${datos.efectivoFisico}</div>
        <div style="font-weight:bold;">Diferencia: $${datos.diferencia}</div>
        ${datos.observaciones ? `<div style="margin-top:4px;"><small>Obs: ${datos.observaciones}</small></div>` : ''}
        <div style="text-align:center; margin-top:15px; font-size:11px;">¡Turno finalizado con éxito!</div>
    `;

    window.print();
}

async function cargarHistorialCierres() {
    if (!comercioActualId) return;

    const { data: cierres } = await db.from('cajas')
        .select('*')
        .eq('comercio_id', comercioActualId)
        .eq('estado', 'cerrada')
        .order('id', { ascending: false })
        .limit(20);

    const tbody = document.getElementById('tabla-body-cierres');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!cierres || cierres.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">No hay cierres de caja registrados aún.</td></tr>';
        return;
    }

    cierres.forEach(c => {
        const fechaObj = new Date(c.closed_at || c.created_at);
        const fechaFormateada = fechaObj.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let colorDif = 'green';
        let textoDif = `$${c.diferencia}`;
        if (c.diferencia < 0) { colorDif = 'red'; textoDif = `Faltante: $${c.diferencia}`; }
        else if (c.diferencia > 0) { colorDif = 'blue'; textoDif = `Sobrante: +$${c.diferencia}`; }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><small>${fechaFormateada}</small></td>
            <td><strong>${c.vendedor_nombre}</strong></td>
            <td>$${c.monto_inicial}</td>
            <td><strong style="color:#28a745;">$${c.total_general}</strong></td>
            <td>$${c.monto_final_declarado}</td>
            <td><span style="color:${colorDif}; font-weight:bold;">${textoDif}</span></td>
            <td>
                <button onclick='reimprimirCierre(${JSON.stringify(c)})' style="background:#17a2b8; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold;">🧾 Reimprimir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function reimprimirCierre(c) {
    const fechaObj = new Date(c.closed_at || c.created_at);
    imprimirTicketCierreHTML({
        fecha: fechaObj.toLocaleString('es-AR'),
        cajero: c.vendedor_nombre,
        fondoInicial: c.monto_inicial,
        efectivoVentas: c.total_efectivo,
        qrVentas: c.total_qr,
        transfVentas: c.total_transferencia,
        totalGeneral: c.total_general,
        efectivoEsperado: Number(c.monto_inicial) + Number(c.total_efectivo),
        efectivoFisico: c.monto_final_declarado,
        diferencia: c.diferencia,
        observaciones: c.observaciones,
        conDetalle: false
    });
}

async function verificarOForzarAperturaCaja() {
    const { data: abierta } = await db.from('cajas')
        .select('*')
        .eq('comercio_id', comercioActualId)
        .eq('estado', 'abierta')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (abierta) {
        cajaActualId = abierta.id;
        fondoInicialActual = abierta.monto_inicial || 0;
        cajaAperturaTimestamp = abierta.created_at;
        cambiarPestaña('ventas');
    } else {
        if (cajeroActivoNombre === 'Dueño') {
            cambiarPestaña('ventas');
        } else {
            abrirModalAperturaCaja();
        }
    }
}

async function verificarOForzarAperturaCajaEnVentas() {
    if (!comercioActualId) return;

    const { data: abierta } = await db.from('cajas')
        .select('*')
        .eq('comercio_id', comercioActualId)
        .eq('estado', 'abierta')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    const inputBuscador = document.getElementById('buscador');

    if (abierta) {
        cajaActualId = abierta.id;
        fondoInicialActual = abierta.monto_inicial || 0;
        cajaAperturaTimestamp = abierta.created_at;
        
        if (inputBuscador) {
            inputBuscador.disabled = false;
            inputBuscador.placeholder = "⚡ Pistoleá código o busca (ej: 5*codigo)...";
            inputBuscador.focus();
        }
    } else {
        if (cajeroActivoNombre === 'Dueño') {
            if (inputBuscador) {
                inputBuscador.disabled = false;
                inputBuscador.placeholder = "⚡ (Caja Cerrada) Pistoleá código o busca...";
            }
            await actualizarResumenVentasPOS();
            return;
        }

        cajaActualId = null;
        cajaAperturaTimestamp = null;
        
        if (inputBuscador) {
            inputBuscador.disabled = true;
            inputBuscador.placeholder = "🔒 Caja cerrada. Debes abrir caja para vender...";
        }

        abrirModalAperturaCaja();
    }

    await actualizarResumenVentasPOS();
}

function cambiarCajeroDesdeModalApertura() {
    document.getElementById('modal-apertura-caja').style.display = 'none';
    solicitarAperturaTurno();
}