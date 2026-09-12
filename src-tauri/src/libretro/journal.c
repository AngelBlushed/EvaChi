/*
 * Le journal des cœurs, en C parce que Rust ne peut pas l'écrire.
 *
 * libretro veut une fonction variadique : `log(niveau, "%s a échoué", nom)`.
 * Rust stable sait *déclarer* ce type, mais pas en définir une — il faudrait
 * `c_variadic`, qui n'est pas stabilisé. Faute de mieux, l'hôte fournissait une
 * fonction non variadique déguisée, qui remontait le gabarit sans le remplir :
 * on lisait « [%s] %s » à la place du message, et aucun cœur ne pouvait plus
 * dire ce qui lui manquait.
 *
 * Ces quinze lignes règlent la chose. `vsnprintf` fait le travail, puis rend la
 * main à Rust avec une chaîne ordinaire.
 */

#include <stdarg.h>
#include <stdio.h>

/* Implémentée côté Rust : reçoit la ligne une fois formatée. */
void evachi_log_line(unsigned level, const char *text);

void evachi_log_printf(unsigned level, const char *fmt, ...)
{
    /* Les cœurs écrivent des lignes, pas des pages. Ce qui déborde est coupé,
       ce qui vaut mieux qu'une allocation à chaque message de débogage. */
    char buffer[2048];
    va_list args;

    if (fmt == NULL) {
        return;
    }

    va_start(args, fmt);
    vsnprintf(buffer, sizeof buffer, fmt, args);
    va_end(args);

    buffer[sizeof buffer - 1] = '\0';
    evachi_log_line(level, buffer);
}
