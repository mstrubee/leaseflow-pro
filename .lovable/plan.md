

## Fix: Error de JSX en WelcomeAlertsBar.tsx

### Problema
Las etiquetas JSX estan mal anidadas en la barra de alertas. El `Button` de crear alerta (linea 281) esta dentro del `div` de tabs cuando deberia estar fuera, y falta un `</div>` de cierre para el contenedor `flex items-center gap-4`.

### Solucion

**`src/components/alerts/WelcomeAlertsBar.tsx`** - Corregir la estructura JSX en lineas 280-294:

Cambiar de:
```
              ))}
              <Button ...>
                <Plus ... />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              ...
            </div>
          </div>
        </div>
```

A:
```
              ))}
              </div>
              <Button ...>
                <Plus ... />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              ...
            </div>
          </div>
        </div>
```

Se agrega `</div>` despues de las tabs (linea 280) para cerrar correctamente el `div.flex.items-center.gap-3`, y el `Button` queda como hermano dentro del `div.flex.items-center.gap-4`.

### Archivo a modificar
- `src/components/alerts/WelcomeAlertsBar.tsx` (lineas 280-290)
