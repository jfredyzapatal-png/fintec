#!/usr/bin/env bash
# ============================================================================
# FINTEC - Verificacion de endpoints de la API desplegada
# ============================================================================
# Uso:
#   bash verificar.sh <URL_BASE> [usuario] [password]
#
# Ejemplos:
#   bash verificar.sh https://fintec-api.onrender.com
#   bash verificar.sh https://fintec-api.onrender.com demo@fintec.com Demo1234
#   bash verificar.sh http://localhost:10000
#
# Si se pasan usuario y password, el script hace login real, guarda el token
# JWT y lo usa en los endpoints protegidos. Si no se pasan, los llama sin
# token: en ese caso un 401 es la respuesta CORRECTA.
#
# Requisitos: bash, curl. (En Windows: Git Bash o WSL. Si no, usar
# verificar.ps1.)
# ============================================================================

set -u

BASE_URL="${1:-}"
USUARIO="${2:-}"
PASSWORD="${3:-}"

# --- Colores (se desactivan si la salida no es una terminal) ----------------
if [ -t 1 ]; then
  ROJO='\033[0;31m'; VERDE='\033[0;32m'; AMARILLO='\033[0;33m'
  AZUL='\033[0;36m'; NEGRITA='\033[1m'; FIN='\033[0m'
else
  ROJO=''; VERDE=''; AMARILLO=''; AZUL=''; NEGRITA=''; FIN=''
fi

if [ -z "$BASE_URL" ]; then
  echo "Uso: bash verificar.sh <URL_BASE> [usuario] [password]"
  echo "Ej:  bash verificar.sh https://fintec-api.onrender.com"
  exit 2
fi

# Quita la barra final para no generar URLs con //
BASE_URL="${BASE_URL%/}"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl no esta instalado." >&2
  exit 2
fi

# Timeout generoso: un servicio gratuito suspendido tarda ~1 minuto en
# despertar, y la primera peticion se queda esperando todo ese tiempo.
TIMEOUT=75

OK=0
FALLOS=0
AVISOS=0
TOKEN=""

echo ""
echo -e "${NEGRITA}=====================================================${FIN}"
echo -e "${NEGRITA} FINTEC - verificacion de la API${FIN}"
echo -e "${NEGRITA}=====================================================${FIN}"
echo -e " URL base : ${AZUL}${BASE_URL}${FIN}"
if [ -n "$USUARIO" ]; then
  echo -e " Login    : ${AZUL}${USUARIO}${FIN} (se usara el token en los demas endpoints)"
else
  echo -e " Login    : ${AMARILLO}sin credenciales${FIN} (se espera 401 en endpoints protegidos)"
fi
echo -e " Timeout  : ${TIMEOUT}s por peticion"
echo ""
echo -e "${AMARILLO}Nota: si el servicio estaba suspendido por inactividad, la"
echo -e "primera peticion puede tardar cerca de un minuto. Es normal.${FIN}"
echo ""

# ---------------------------------------------------------------------------
# probar <metodo> <ruta> <descripcion> <codigos_esperados> [cuerpo_json] [usar_token]
#   codigos_esperados: lista separada por espacios, p.ej. "200 401"
#   usar_token: "si" para enviar Authorization: Bearer
# ---------------------------------------------------------------------------
probar() {
  local metodo="$1" ruta="$2" desc="$3" esperados="$4"
  local cuerpo="${5:-}" usar_token="${6:-no}"
  local url="${BASE_URL}${ruta}"

  printf " %-7s %-26s " "$metodo" "$ruta"

  local args=(-s -S -o /dev/null -w '%{http_code} %{time_total}'
              --max-time "$TIMEOUT" -X "$metodo" "$url")

  if [ -n "$cuerpo" ]; then
    args+=(-H 'Content-Type: application/json' --data "$cuerpo")
  fi
  if [ "$usar_token" = "si" ] && [ -n "$TOKEN" ]; then
    args+=(-H "Authorization: Bearer ${TOKEN}")
  fi

  local salida codigo tiempo
  if ! salida="$(curl "${args[@]}" 2>/dev/null)"; then
    echo -e "${ROJO}SIN RESPUESTA${FIN}  (timeout, DNS o servicio caido)"
    FALLOS=$((FALLOS + 1))
    return
  fi

  codigo="${salida%% *}"
  tiempo="${salida##* }"

  if [ "$codigo" = "000" ] || [ -z "$codigo" ]; then
    echo -e "${ROJO}SIN RESPUESTA${FIN}  (timeout, DNS o servicio caido)"
    FALLOS=$((FALLOS + 1))
    return
  fi

  # Esperado?
  local es_esperado="no" c
  for c in $esperados; do
    [ "$codigo" = "$c" ] && es_esperado="si"
  done

  if [ "$es_esperado" = "si" ]; then
    echo -e "${VERDE}HTTP ${codigo}${FIN}  ${tiempo}s   ${desc}"
    OK=$((OK + 1))
  elif [ "$codigo" -ge 500 ] 2>/dev/null; then
    echo -e "${ROJO}HTTP ${codigo}${FIN}  ${tiempo}s   ${desc} -> ERROR DEL SERVIDOR, revisa los Logs en Render"
    FALLOS=$((FALLOS + 1))
  elif [ "$codigo" = "404" ]; then
    echo -e "${ROJO}HTTP 404${FIN}  ${tiempo}s   ${desc} -> la ruta no existe (ojo al prefijo /api)"
    FALLOS=$((FALLOS + 1))
  else
    echo -e "${AMARILLO}HTTP ${codigo}${FIN}  ${tiempo}s   ${desc} -> responde, pero no era el codigo esperado (${esperados})"
    AVISOS=$((AVISOS + 1))
  fi
}

# ---------------------------------------------------------------------------
# 0) Alcanzabilidad y health check
# ---------------------------------------------------------------------------
echo -e "${NEGRITA}--- Disponibilidad ---------------------------------${FIN}"
probar GET "/" "raiz del servicio" "200 301 302 404"
probar GET "/api/health" "health check" "200 404"
echo ""

# ---------------------------------------------------------------------------
# 1) Login
# ---------------------------------------------------------------------------
echo -e "${NEGRITA}--- Autenticacion ----------------------------------${FIN}"

if [ -n "$USUARIO" ] && [ -n "$PASSWORD" ]; then
  # El login real se hace aparte para poder capturar el token del cuerpo.
  printf " %-7s %-26s " "POST" "/api/auth/login"

  RESP="$(curl -s -S --max-time "$TIMEOUT" \
            -w $'\n%{http_code}' \
            -X POST "${BASE_URL}/api/auth/login" \
            -H 'Content-Type: application/json' \
            --data "{\"email\":\"${USUARIO}\",\"password\":\"${PASSWORD}\"}" 2>/dev/null)" || RESP=""

  CODIGO="$(printf '%s' "$RESP" | tail -n 1)"
  BODY="$(printf '%s' "$RESP" | sed '$d')"

  if [ -z "$CODIGO" ] || [ "$CODIGO" = "000" ]; then
    echo -e "${ROJO}SIN RESPUESTA${FIN}  (timeout o servicio caido)"
    FALLOS=$((FALLOS + 1))
  elif [ "$CODIGO" = "200" ] || [ "$CODIGO" = "201" ]; then
    # Extrae "token" o "accessToken" del JSON sin depender de jq.
    TOKEN="$(printf '%s' "$BODY" \
      | sed -n 's/.*"\(token\|accessToken\|jwt\)"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\2/p' \
      | head -n 1)"
    if [ -n "$TOKEN" ]; then
      echo -e "${VERDE}HTTP ${CODIGO}${FIN}       login correcto, token obtenido"
    else
      echo -e "${AMARILLO}HTTP ${CODIGO}${FIN}       login 200 pero NO se encontro token en el JSON"
      echo "           respuesta: $(printf '%s' "$BODY" | head -c 200)"
      AVISOS=$((AVISOS + 1))
    fi
    OK=$((OK + 1))
  elif [ "$CODIGO" = "401" ] || [ "$CODIGO" = "400" ]; then
    echo -e "${ROJO}HTTP ${CODIGO}${FIN}       credenciales rechazadas -> ¿corrio el seed? ¿usuario/clave correctos?"
    FALLOS=$((FALLOS + 1))
  else
    echo -e "${ROJO}HTTP ${CODIGO}${FIN}       respuesta inesperada en el login"
    echo "           respuesta: $(printf '%s' "$BODY" | head -c 200)"
    FALLOS=$((FALLOS + 1))
  fi

  # El login debe RECHAZAR credenciales falsas.
  probar POST "/api/auth/login" "credenciales invalidas deben dar 400/401" "400 401 422" \
    '{"email":"noexiste@fintec.test","password":"clave-incorrecta"}'
else
  # Sin credenciales: solo comprobamos que la ruta existe y valida la entrada.
  probar POST "/api/auth/login" "la ruta existe y valida (400/401 esperado)" "400 401 422" \
    '{"email":"noexiste@fintec.test","password":"clave-incorrecta"}'
fi
echo ""

# ---------------------------------------------------------------------------
# 2) Endpoints protegidos
# ---------------------------------------------------------------------------
echo -e "${NEGRITA}--- Endpoints protegidos ---------------------------${FIN}"

if [ -n "$TOKEN" ]; then
  probar GET "/api/cuenta/me"       "datos de la cuenta"  "200" "" si
  probar GET "/api/movimientos"     "lista de movimientos" "200" "" si
  probar GET "/api/contable/resumen" "resumen contable"    "200" "" si
  echo ""
  echo -e "${NEGRITA}--- Control de acceso (sin token) ------------------${FIN}"
  TOKEN_GUARDADO="$TOKEN"; TOKEN=""
  probar GET "/api/cuenta/me"        "sin token debe dar 401" "401 403"
  probar GET "/api/movimientos"      "sin token debe dar 401" "401 403"
  probar GET "/api/contable/resumen" "sin token debe dar 401" "401 403"
  TOKEN="$TOKEN_GUARDADO"
else
  echo -e " ${AMARILLO}Sin token: se espera 401. Un 200 aqui seria un FALLO DE SEGURIDAD.${FIN}"
  probar GET "/api/cuenta/me"        "sin token debe dar 401" "401 403"
  probar GET "/api/movimientos"      "sin token debe dar 401" "401 403"
  probar GET "/api/contable/resumen" "sin token debe dar 401" "401 403"
  echo ""
  echo -e " ${AMARILLO}Para probar las respuestas 200, vuelve a ejecutar con credenciales:${FIN}"
  echo -e "   bash verificar.sh ${BASE_URL} <usuario> <password>"
fi

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
echo ""
echo -e "${NEGRITA}=====================================================${FIN}"
echo -e " Correctos: ${VERDE}${OK}${FIN}   Avisos: ${AMARILLO}${AVISOS}${FIN}   Fallos: ${ROJO}${FALLOS}${FIN}"
echo -e "${NEGRITA}=====================================================${FIN}"

if [ "$FALLOS" -gt 0 ]; then
  echo ""
  echo " Que revisar:"
  echo "  - Render > servicio fintec-api > pestana Logs (errores en ejecucion)"
  echo "  - Render > servicio fintec-api > pestana Events (errores de build)"
  echo "  - 'relation ... does not exist'  -> faltan las migraciones (paso 7)"
  echo "  - 'ECONNREFUSED' / 'ENOTFOUND'   -> DATABASE_URL o regiones distintas"
  echo "  - 404 en todo                    -> revisa el prefijo de rutas (/api)"
  echo "  - SIN RESPUESTA en todo          -> servicio suspendido, caido o URL mal"
  echo ""
  exit 1
fi

if [ "$AVISOS" -gt 0 ]; then
  echo ""
  echo " Sin fallos, pero hay avisos: comprueba a mano los codigos marcados."
  echo ""
  exit 0
fi

echo ""
echo -e " ${VERDE}Todo responde como se esperaba.${FIN}"
echo ""
exit 0
