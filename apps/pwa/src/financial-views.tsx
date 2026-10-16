import { useState } from "react";
import type { VaultSession } from "@paymentplan/application";
import {
  addMonths,
  budgetFocus,
  homeSummary,
  live,
  paydaysThrough,
  progressiveSchedule,
  progressiveTerms,
  quotaBalances,
  suggestedPaymentDate,
} from "@paymentplan/domain";
import type {
  CardView,
  Change,
  FinanceView,
  LoanView,
  Portfolio,
} from "@paymentplan/domain";
import type { Loan } from "@paymentplan/contracts";
import {
  csvCell,
  Dialog,
  download,
  Empty,
  Icon,
  money,
  shortDate,
} from "./ui.tsx";
import type { FinancialModal } from "./financial-forms.tsx";
type Modal = (modal: FinancialModal) => void;
type Act = (prepare: () => Change[] | Promise<Change[]>) => void;
export function Dashboard({
  view,
  modal,
  p,
}: {
  view: FinanceView;
  modal: Modal;
  p: Portfolio;
}) {
  const paymentPeriods = paydaysThrough(view.today, addMonths(view.today, 3, 1))
    .slice(0, 4)
    .map((payday) => {
      const period = view.budgets.find(
        (candidate) => candidate.payday === payday,
      );
      return {
        payday,
        pendingCents: period?.pendingCents ?? 0,
        payments: view.cards
          .flatMap((card) =>
            [...card.cuts.filter((cut) => cut.current), ...card.projections]
              .filter((cut) => cut.payday === payday)
              .map((cut) => ({ ...cut, name: card.name })),
          )
          .sort(
            (a, b) =>
              a.dueDate.localeCompare(b.dueDate) ||
              a.name.localeCompare(b.name),
          ),
      };
    });
  const home = homeSummary(p, view),
    cutFor = (cardId: string) =>
      view.cards.find((c) => c.id === cardId)?.cuts.find((c) => c.current);
  const segmentLabels = {
    expenses: "Gastos esenciales",
    reserve: "Reserva",
    cards: "Tarjetas",
    loans: "Préstamos",
  } as const;
  const periodTotal = home.period
    ? Math.max(
        home.period.incomeCents,
        home.period.segments.reduce((sum, s) => sum + s.cents, 0),
      )
    : 0;
  return (
    <>
      <section
        className="panel home-actions"
        aria-label="Acciones de la quincena"
      >
        <h2>Qué hacer ahora</h2>
        {home.actions.length ? (
          <ul>
            {home.actions.map((a) =>
              a.kind === "payroll" ? (
                <li key={"p" + a.payday}>
                  <span>
                    <strong>Confirmar ingreso del {shortDate(a.payday)}</strong>
                    <small>Se abona a {a.accountName}</small>
                  </span>
                  <button
                    className="primary"
                    onClick={() => modal({ type: "payroll", payday: a.payday })}
                  >
                    Confirmar ingreso
                  </button>
                </li>
              ) : a.kind === "loanInstallment" ? (
                <li key={"l" + a.loanId + a.dueDate}>
                  <span>
                    <strong>
                      Pagar {a.person} · {shortDate(a.dueDate)}
                    </strong>
                    <small>
                      {money(a.amountCents)} estimados desde {a.accountName}
                      {a.waitingForPayroll
                        ? " · confirma antes el ingreso"
                        : ""}
                    </small>
                  </span>
                  <button
                    className="primary"
                    disabled={a.waitingForPayroll}
                    onClick={() =>
                      modal({
                        type: "loanInstallment",
                        loanId: a.loanId,
                        dueDate: a.dueDate,
                      })
                    }
                  >
                    Registrar pago
                  </button>
                </li>
              ) : (
                <li key={"c" + a.cardId}>
                  <span>
                    <strong>Revisar corte de {a.cardName}</strong>
                    <small>
                      Corte del {shortDate(a.cutDate)} sin confirmar con el
                      banco
                    </small>
                  </span>
                  <button
                    className="secondary"
                    onClick={() => {
                      const cut = cutFor(a.cardId);
                      if (cut) modal({ type: "cut", cardId: a.cardId, cut });
                    }}
                  >
                    Revisar corte
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="muted">
            Todo al día. No tienes ingresos, cuotas ni cortes pendientes de
            registrar.
          </p>
        )}
      </section>
      <div className="metrics home-metrics">
        <a className="metric-link" href="#/cuentas">
          <article>
            <span>Disponible</span>
            <strong>
              {home.hasAccounts ? money(home.availableCents) : "—"}
            </strong>
            <small>
              {home.hasAccounts
                ? `Saldo ${money(home.totalCashCents)} · apartado en metas ${money(home.reservedCents)}`
                : "Registra una cuenta para verlo"}
            </small>
          </article>
        </a>
        <a className="metric-link" href="#/presupuesto">
          <article>
            <span>
              Por pagar
              {home.period ? ` · ${shortDate(home.period.payday)}` : ""}
            </span>
            <strong>{money(home.period?.payCents ?? 0)}</strong>
            <small>Tarjetas y préstamos de la quincena</small>
          </article>
        </a>
        <a className="metric-link" href="#/presupuesto">
          <article
            className={
              home.period && home.period.leftoverCents < 0
                ? "negative-card"
                : "highlight"
            }
          >
            <span>Sobrante proyectado</span>
            <strong
              className={
                home.period && home.period.leftoverCents < 0 ? "negative" : ""
              }
            >
              {money(home.period?.leftoverCents ?? 0)}
            </strong>
            <small>
              {home.period?.estimated
                ? "Con ingreso estimado"
                : "Con ingreso recibido"}
            </small>
          </article>
        </a>
        <a
          className="metric-link"
          href="#/plan"
          aria-label="Ver todo el calendario de pagos"
        >
          <article>
            <span>Deuda total</span>
            <strong>{money(home.debtCents)}</strong>
            <small>
              Tarjetas {money(view.debtCents)} · préstamos{" "}
              {money(view.loanDebtCents)}
            </small>
          </article>
        </a>
      </div>
      {home.period && home.period.incomeCents > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Salud de la quincena del {shortDate(home.period.payday)}</h2>
              <p className="caption">
                Ingreso {money(home.period.incomeCents)} repartido entre gastos,
                reserva y pagos.
              </p>
            </div>
          </div>
          <div
            className="health-bar"
            role="img"
            aria-label={`Ingreso ${money(home.period.incomeCents)}, sobrante ${money(home.period.leftoverCents)}`}
          >
            {home.period.segments
              .filter((s) => s.cents > 0)
              .map((s) => (
                <span
                  key={s.key}
                  className={`seg-${s.key}`}
                  style={{ width: `${(s.cents / periodTotal) * 100}%` }}
                  title={`${segmentLabels[s.key]} ${money(s.cents)}`}
                />
              ))}
            {home.period.leftoverCents > 0 && (
              <span
                className="seg-left"
                style={{
                  width: `${(home.period.leftoverCents / periodTotal) * 100}%`,
                }}
                title={`Sobrante ${money(home.period.leftoverCents)}`}
              />
            )}
          </div>
          <ul className="health-legend">
            {home.period.segments.map((s) => (
              <li key={s.key}>
                <i className={`seg-${s.key}`} />
                {segmentLabels[s.key]} <strong>{money(s.cents)}</strong>
              </li>
            ))}
            <li>
              <i className="seg-left" />
              Sobrante{" "}
              <strong
                className={home.period.leftoverCents < 0 ? "negative" : ""}
              >
                {money(home.period.leftoverCents)}
              </strong>
            </li>
          </ul>
        </section>
      )}
      <div className="home-columns">
        {view.loans.some((l) => l.loanType === "bank" && l.balanceCents > 0) && (
        <section className="panel">
          <div className="section-heading">
            <h2>Préstamos bancarios</h2>
            <a href="#/prestamos">Ver préstamos →</a>
          </div>
          <div className="planning-grid">
            {view.loans
              .filter((l) => l.loanType === "bank" && l.balanceCents > 0)
              .map((l) => {
                const done =
                  l.paidCents + l.balanceCents > 0
                    ? Math.round(
                        (l.paidCents / (l.paidCents + l.balanceCents)) * 100,
                      )
                    : 0;
                return (
                  <article className="planning-card" key={l.id}>
                    <h2>{l.person}</h2>
                    <strong className="planning-amount">
                      {money(
                        l.progressive?.balanceToDateCents ?? l.balanceCents,
                      )}
                    </strong>
                    <small>
                      {l.progressive ? "Saldo al día" : "Saldo estimado"}
                      {l.progressive
                        ? ` · monto utilizado ${money(l.progressive.usedAmountCents)}`
                        : ""}
                    </small>
                    <small>
                      {l.progressive
                        ? ` · cuotas restantes ${l.progressive.remainingInstallments} `
                        : " · Cuota fija"}
                      {l.nextPaymentDate
                        ? ` · próxima ${shortDate(l.nextPaymentDate)}`
                        : ""}
                      {l.installmentPaymentCents
                        ? ` · ${money(l.installmentPaymentCents)}`
                        : ""}
                    </small>
                    <div
                      className="progress-track"
                      role="img"
                      aria-label={`Avance de pago ${done}%`}
                    >
                      <span style={{ width: `${done}%` }} />
                    </div>
                    <small>{done}% pagado desde el registro</small>
                  </article>
                );
              })}
          </div>
        </section>
      )}
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Plan de pagos por quincena</h2>
              <p className="caption">
                Las próximas cuatro quincenas organizan los pagos estimados y
                confirmados de tus tarjetas.
              </p>
            </div>
          </div>
          {!view.cards.length ? (
            <Empty
              title="Tu cartera empieza aquí"
              text="Registra el límite, disponible y deuda inicial de tus tarjetas. Después agrega gastos, pagos y planes a meses."
              action={
                <button
                  className="primary"
                  onClick={() => modal({ type: "card" })}
                >
                  Registrar mi primera tarjeta
                </button>
              }
            />
          ) : (
            <div className="payday-groups">
              {paymentPeriods.map((period, index) => (
                <details
                  className="payday-group"
                  key={period.payday}
                  open={index === 0}
                >
                  <summary>
                    <span>
                      <strong>Quincena del {shortDate(period.payday)}</strong>
                      <small>
                        {period.payments.length
                          ? `${period.payments.length} ${period.payments.length === 1 ? "pago de tarjeta" : "pagos de tarjetas"}`
                          : "Sin pagos de tarjetas previstos"}
                      </small>
                    </span>
                    <span className="payday-total">
                      <small>Tarjetas por pagar</small>
                      <strong>{money(period.pendingCents)}</strong>
                    </span>
                  </summary>
                  <div className="payday-group-content">
                    {period.payments.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Tarjeta</th>
                              <th>Corte</th>
                              <th>Vencimiento</th>
                              <th>Estado</th>
                              <th className="numeric">Pendiente</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {period.payments.map((payment) => (
                              <tr key={payment.id}>
                                <td>
                                  <strong>{payment.name}</strong>
                                </td>
                                <td>{shortDate(payment.cutDate)}</td>
                                <td>{shortDate(payment.dueDate)}</td>
                                <td>
                                  {payment.estimated
                                    ? payment.current
                                      ? "Estimado vigente"
                                      : "Proyección"
                                    : "Confirmado"}
                                </td>
                                <td className="numeric">
                                  {money(payment.pendingCents)}
                                </td>
                                <td>
                                  {payment.current &&
                                    payment.cutDate <= view.today && (
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          modal({
                                            type: "cut",
                                            cardId: payment.cardId,
                                            cut: payment,
                                          })
                                        }
                                      >
                                        Revisar corte
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="caption payday-empty">
                        No tienes pagos de tarjetas previstos para esta quincena.
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
          <p className="caption">
            Los estimados cambian con tus movimientos reales. El banco confirma el
            importe final y los cargos que aún no hayas registrado.
          </p>
        </section>
      </div>
      <div className="home-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>Cuentas y metas</h2>
            <a href="#/cuentas">Ver cuentas →</a>
          </div>
          {home.accounts.length ? (
            <ul className="plain-list">
              {home.accounts.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.name}
                    {a.payroll && <small className="tag">Nómina</small>}
                  </span>
                  <strong>{money(a.balanceCents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Aún no registras cuentas de efectivo o débito.
            </p>
          )}
          {home.goals.map((g) => (
            <div key={g.id} className="goal-row">
              <span>
                {g.name}
                <small>
                  {money(g.savedCents)} de {money(g.targetCents)}
                </small>
              </span>
              <div className="progress-track">
                <span
                  style={{
                    width: `${g.targetCents > 0 ? Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Gasto del mes</h2>
            <a href="#/categorias">Ver categorías →</a>
          </div>
          {home.categories.length ? (
            <ul className="plain-list">
              {home.categories.map((c) => (
                <li key={c.id}>
                  <span>
                    <i className="dot" style={{ background: c.color }} />
                    {c.name}
                    {c.limitCents !== null && (
                      <small
                        className={
                          c.spentCents > c.limitCents ? "negative" : ""
                        }
                      >
                        Límite {money(c.limitCents)}
                        {c.spentCents > c.limitCents ? " · excedido" : ""}
                      </small>
                    )}
                  </span>
                  <strong>{money(c.spentCents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sin gastos categorizados este mes.</p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Por revisar</h2>
          <a href="#/movimientos">Ver movimientos →</a>
        </div>
        {view.cards.flatMap((c) =>
          c.alerts.map((a) => (
            <p className="alert" key={c.id + a.code}>
              {c.name}:{" "}
              {a.code === "balanceMismatch"
                ? "Disponible y deuda no cuadran con el límite"
                : a.code === "limitExceeded"
                  ? "Se excedió el límite de crédito"
                  : "Tienes saldo a favor"}{" "}
              · {money(a.amountCents)}. Revisa los saldos con tu banco.
            </p>
          )),
        )}
        {view.cards
          .filter((c) => c.reviewPreviousDebt)
          .map((c) => (
            <p className="alert" key={c.id}>
              Revisa si la deuda inicial de {c.name} incluye un corte anterior.
              Registra ese corte para incluir su vencimiento.
            </p>
          ))}
        {live(p.movements).filter(
          (m) => m.value.scheduled && m.value.date <= view.today,
        ).length > 0 && (
          <p className="alert">
            Tienes movimientos programados cuya fecha ya llegó. Confírmalos solo
            si los realizaste.
          </p>
        )}
        {!view.cards.some((c) => c.alerts.length || c.reviewPreviousDebt) &&
          !live(p.movements).some(
            (m) => m.value.scheduled && m.value.date <= view.today,
          ) && (
            <p className="muted">
              Tus registros están al día. El sistema no realiza pagos bancarios
              automáticamente.
            </p>
          )}
      </section>
    </>
  );
}
function PlanDetails({
  card,
  p,
  today,
  modal,
  act,
  session,
}: {
  card: CardView;
  p: Portfolio;
  today: string;
  modal: Modal;
  act: Act;
  session: VaultSession;
}) {
  const balances = quotaBalances(p, card.id, today);
  const current = card.plans.filter(
      (plan) => !plan.cancelled && plan.remainingCents > 0,
    ),
    finished = card.plans.filter(
      (plan) => !plan.cancelled && plan.remainingCents <= 0,
    ),
    cancelled = card.plans.filter((plan) => plan.cancelled);
  const groups = [
    { key: "current", title: "En curso", plans: current },
    { key: "finished", title: "Liquidados", plans: finished },
    { key: "cancelled", title: "Cancelados", plans: cancelled },
  ];
  return (
    <section className="card-detail">
      <div className="section-heading plans-overview">
        <p className="caption">
          Deuda actual a meses: {money(card.installmentDebtCents)} · saldo libre
          para dividir: {money(card.freeDebtCents)}
        </p>
        <button
          className="secondary"
          onClick={() => modal({ type: "plan", cardId: card.id })}
        >
          Dividir deuda
        </button>
      </div>
      {!card.plans.filter((r) => !r.cancelled).length && (
        <p className="muted">Esta tarjeta todavía no tiene planes a meses.</p>
      )}
      <details className="plan-detail">
        <summary>
          <strong>Resúmenes al corte</strong>
          <span className="caption">
            {card.cuts.length} periodos registrados / estimados
          </span>
        </summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Corte</th>
                <th>Vencimiento</th>
                <th>Objetivo</th>
                <th>Pagado</th>
                <th>Apartado</th>
                <th>Pendiente</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {card.cuts.map((c) => (
                <tr key={c.id}>
                  <td>
                    {shortDate(c.cutDate)}
                    <small>{c.estimated ? "Estimado" : "Confirmado"}</small>
                  </td>
                  <td>{shortDate(c.dueDate)}</td>
                  <td>{money(c.targetCents)}</td>
                  <td>{money(c.paidCents)}</td>
                  <td>{money(c.reservedCents)}</td>
                  <td>{money(c.pendingCents)}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={c.cutDate > today}
                      onClick={() =>
                        modal({ type: "cut", cardId: card.id, cut: c })
                      }
                    >
                      Revisar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {groups.map((group) => (
        <details
          className={`plan-group plan-group-${group.key}`}
          key={group.key}
          open={group.key === "current" && group.plans.length > 0}
        >
          <summary>
            <span>{group.title}</span>
            <span className="plan-count">{group.plans.length}</span>
          </summary>
          <div className="plan-group-content">
            {group.plans.length ? (
              group.plans.map((plan) => (
                <details
                  className="plan-detail installment-detail"
                  key={plan.id}
                >
                  <summary>
                    <span>
                      <strong>{plan.description}</strong>
                      <small>
                        {plan.months} cuotas · último pago{" "}
                        {shortDate(plan.quotas.at(-1)!.dueDate)}
                        {plan.cancelled ? " · no genera obligaciones" : ""}
                      </small>
                    </span>
                    <span className="numeric">
                      <small>Saldo restante estimado</small>
                      <strong>{money(plan.remainingCents)}</strong>
                    </span>
                  </summary>
                  <div className="plan-body">
                    <div className="inline-actions">
                      <span className="caption">
                        Interés por devengar: {money(plan.futureInterestCents)}
                      </span>
                      {!plan.cancelled && (
                        <button
                          className="text-button"
                          onClick={() =>
                            modal({
                              type: "plan",
                              id: plan.id,
                              cardId: card.id,
                            })
                          }
                        >
                          Editar plan
                        </button>
                      )}
                      {!plan.cancelled && (
                        <button
                          className="text-button danger"
                          onClick={() =>
                            act(() =>
                              session.commands(today).cancelPlan(plan.id),
                            )
                          }
                        >
                          Deshacer plan
                        </button>
                      )}
                    </div>
                    {plan.editReason && (
                      <p className="caption">{plan.editReason}</p>
                    )}
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Cuota</th>
                            <th>Corte / pago</th>
                            <th className="numeric">Capital</th>
                            <th className="numeric">Interés</th>
                            <th className="numeric">Saldo restante</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {plan.quotas.map((q) => {
                            const balance = balances.find(
                              (b) =>
                                b.planId === plan.id && b.number === q.number,
                            );
                            return (
                              <tr key={q.number}>
                                <td>{q.number}</td>
                                <td>
                                  {shortDate(q.cutDate)}
                                  <small>{shortDate(q.dueDate)}</small>
                                </td>
                                <td className="numeric">
                                  {money(q.principalCents)}
                                </td>
                                <td className="numeric">
                                  {money(q.interestCents)}
                                </td>
                                <td className="numeric">
                                  {money(
                                    (balance?.principalCents ?? 0) +
                                      (balance?.interestCents ?? 0) +
                                      (balance?.futureInterestCents ?? 0),
                                  )}
                                </td>
                                <td>
                                  {!plan.cancelled &&
                                    balance &&
                                    balance.principalCents +
                                      balance.interestCents >
                                      0 && (
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          modal({
                                            type: "movement",
                                            cardId: card.id,
                                            planId: plan.id,
                                            quotaNumber: q.number,
                                            capitalCents:
                                              balance.principalCents,
                                            interestCents:
                                              balance.interestCents,
                                          })
                                        }
                                      >
                                        Pagar cuota
                                      </button>
                                    )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="caption">
                      El saldo restante incluye capital e intereses pendientes,
                      también los futuros. Sin desglose bancario se estima la
                      distribución de pagos; usa una atribución explícita para
                      registrar anticipos a cuotas concretas.
                    </p>
                  </div>
                </details>
              ))
            ) : (
              <p className="caption plan-group-empty">
                No hay planes{" "}
                {group.key === "current"
                  ? "en curso"
                  : group.key === "finished"
                    ? "liquidados"
                    : "cancelados"}
                .
              </p>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}
export function CardsView({
  view,
  session,
  modal,
  act,
}: {
  view: FinanceView;
  session: VaultSession;
  modal: Modal;
  act: Act;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    p = session.portfolio;
  const selectedCard = view.cards.find((c) => c.id === selected);
  function openPlans(cardId: string) {
    setSelected(cardId);
  }
  function editFromPlans(next: FinancialModal) {
    setSelected(null);
    modal(next);
  }
  return (
    <>
      <div className="section-heading">
        <p className="muted">
          Ordenadas por mayor deuda · {view.cards.length} tarjetas
        </p>
        <button className="primary" onClick={() => modal({ type: "card" })}>
          <Icon name="plus" size={16} /> Agregar tarjeta
        </button>
      </div>
      {!view.cards.length && (
        <Empty
          title="Registra tus tarjetas"
          text="Tus tarjetas tendrán sus propios saldos, color, corte y plan de pagos."
        />
      )}
      <div className="credit-grid">
        {view.cards.map((c) => {
          const data = p.cards.find((r) => r.id === c.id)!.value,
            cut = c.cuts.find((s) => s.current)!;
          const planCount = c.plans.filter(
            (plan) => !plan.cancelled && plan.remainingCents > 0,
          ).length;
          return (
            <article
              className="credit-card"
              key={c.id}
              style={{ "--card-color": data.color } as React.CSSProperties}
            >
              <div className="credit-heading">
                <div className="credit-heading-name">
                  <span>{data.bank}</span>
                  <h2>{c.name}</h2>
                </div>
                <details
                  className="card-menu"
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest("button")
                    )
                      event.currentTarget.removeAttribute("open");
                  }}
                >
                  <summary
                    aria-label={`Acciones de ${c.name}`}
                    title="Acciones de tarjeta"
                  >
                    <span aria-hidden="true">⋯</span>
                  </summary>
                  <div>
                    <section className="card-menu-group">
                      <h3>Tarjeta</h3>
                      <button onClick={() => modal({ type: "card", id: c.id })}>
                        Editar tarjeta
                      </button>
                    </section>
                    <section className="card-menu-group">
                      <h3>Movimientos y planes</h3>
                      <button
                        onClick={() =>
                          modal({ type: "movement", cardId: c.id })
                        }
                      >
                        Registrar movimiento
                      </button>
                      <button
                        onClick={() => modal({ type: "plan", cardId: c.id })}
                      >
                        Dividir deuda / compra a meses
                      </button>
                      <button
                        onClick={(event) => {
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                          openPlans(c.id);
                        }}
                      >
                        Ver planes y cortes
                      </button>
                    </section>
                    <section className="card-menu-group">
                      <h3>Corte y pagos</h3>
                      <button
                        onClick={() =>
                          modal({ type: "reconcile", cardId: c.id })
                        }
                      >
                        Conciliar con el banco
                      </button>
                      <button
                        disabled={cut.cutDate > view.today}
                        onClick={() =>
                          modal({ type: "cut", cardId: c.id, cut })
                        }
                      >
                        Revisar corte
                      </button>
                      <button
                        onClick={() =>
                          modal({
                            type: "cut",
                            cardId: c.id,
                            cut: {
                              ...cut,
                              cutDate: view.today,
                              dueDate: view.today,
                              targetCents: 0,
                            },
                            create: true,
                          })
                        }
                      >
                        Registrar otro corte
                      </button>
                      <button
                        onClick={() =>
                          modal({ type: "reserve", cardId: c.id, cut })
                        }
                      >
                        Apartar dinero para el corte
                      </button>
                    </section>
                    <section className="card-menu-group card-menu-management">
                      <h3>Administrar</h3>
                      <button
                        disabled={c.debtCents !== 0}
                        onClick={() =>
                          act(() =>
                            session
                              .commands(view.today)
                              .saveCard(
                                { ...data, archived: true },
                                undefined,
                                c.id,
                              ),
                          )
                        }
                      >
                        Archivar tarjeta liquidada
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Eliminar ${c.name} y todo su historial de la cartera activa? Los registros cifrados se conservan anulados para sincronización.`,
                            )
                          )
                            act(() =>
                              session.commands(view.today).deleteCard(c.id),
                            );
                        }}
                      >
                        Eliminar tarjeta e historial
                      </button>
                    </section>
                  </div>
                </details>
              </div>
              <div className="credit-limit">
                <span>Límite de crédito</span>
                <strong>{money(data.limitCents)}</strong>
              </div>
              <div className="credit-balances">
                <div className="credit-balance-item credit-balance-debt">
                  <span>Deuda actual</span>
                  <strong>{money(Math.max(0, c.debtCents))}</strong>
                </div>
                <div className="credit-balance-item">
                  <span>Disponible</span>
                  <strong>{money(c.availableCents)}</strong>
                </div>
              </div>
              <button
                type="button"
                className="credit-months"
                aria-label={`Deuda a meses ${money(c.installmentDebtCents)} · ${planCount} planes en curso. Abrir detalle de ${c.name}`}
                onClick={() =>
                  selected === c.id ? setSelected(null) : openPlans(c.id)
                }
              >
                <span className="credit-months-total">
                  <span>Deuda a meses</span>
                  <strong>{money(c.installmentDebtCents)}</strong>
                </span>
                <span className="credit-months-action">
                  {planCount}{" "}
                  {planCount === 1 ? "plan en curso" : "planes en curso"}{" "}
                  <Icon name="arrow" size={16} />
                </span>
              </button>
              <div className="credit-footer">
                <span>
                  Corte día {data.cutDay} · pago día {data.dueDay}
                </span>
                <span>Planes: {c.plans.length}</span>
              </div>
              {c.alerts.length > 0 && (
                <span className="card-warning">
                  {c.alerts.some((a) => a.code !== "creditBalance")
                    ? "Revisar cuadre de saldos"
                    : "Saldo a favor"}
                </span>
              )}
            </article>
          );
        })}
      </div>
      {selectedCard && (
        <Dialog
          title={`Planes de ${selectedCard.name}`}
          close={() => setSelected(null)}
          className="plans-dialog"
        >
          <PlanDetails
            card={selectedCard}
            p={p}
            today={view.today}
            modal={editFromPlans}
            act={act}
            session={session}
          />
        </Dialog>
      )}
      {live(p.cards).filter((c) => c.value.archived).length > 0 && (
        <details className="panel">
          <summary>Tarjetas archivadas</summary>
          {live(p.cards)
            .filter((c) => c.value.archived)
            .map((c) => (
              <div className="settings-row" key={c.id}>
                <span>{c.value.name}</span>
                <button
                  className="text-button"
                  onClick={() =>
                    act(() =>
                      session
                        .commands(view.today)
                        .saveCard(
                          { ...c.value, archived: false },
                          undefined,
                          c.id,
                        ),
                    )
                  }
                >
                  Reactivar
                </button>
              </div>
            ))}
        </details>
      )}
    </>
  );
}
export function MovementsView({
  session,
  today,
  modal,
  act,
}: {
  session: VaultSession;
  today: string;
  modal: Modal;
  act: Act;
}) {
  const [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [kindFilter, setKindFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    p = session.portfolio;
  const rows = p.movements
    .filter(
      (m) =>
        live(p.cards).some((c) => c.id === m.value.cardId) &&
        (!kindFilter || m.value.kind === kindFilter) &&
        (!from || m.value.date >= from) &&
        (!to || m.value.date <= to) &&
        (!filter || m.value.cardId === filter) &&
        m.value.description.toLowerCase().includes(search.toLowerCase()),
    )
    .toSorted(
      (a, b) =>
        b.value.date.localeCompare(a.value.date) ||
        (b.value.recordedAt ?? "").localeCompare(a.value.recordedAt ?? ""),
    );
  const labels = {
    expense: "Gasto",
    payment: "Pago",
    interest: "Interés",
    fee: "Comisión",
  };
  return (
    <section className="panel">
      <div className="filter-bar">
        <label>
          Tarjeta
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas las tarjetas</option>
            {live(p.cards).map((c) => (
              <option key={c.id} value={c.id}>
                {c.value.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Descripción del movimiento"
          />
        </label>
        <label>
          Tipo
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(labels).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          onClick={() =>
            download(
              `paymentplan-movimientos-${today}.csv`,
              "\ufeff" +
                [
                  ["Fecha", "Tarjeta", "Tipo", "Descripción", "MXN", "Estado"],
                  ...rows.map((m) => [
                    m.value.date,
                    p.cards.find((c) => c.id === m.value.cardId)?.value.name ??
                      "",
                    labels[m.value.kind],
                    m.value.description,
                    (m.value.amountCents / 100).toFixed(2),
                    m.voided
                      ? "Anulado"
                      : m.value.scheduled
                        ? "Programado"
                        : "Realizado",
                  ]),
                ]
                  .map((row) => row.map(csvCell).join(","))
                  .join("\r\n"),
              "text/csv;charset=utf-8",
            )
          }
        >
          Exportar CSV
        </button>
      </div>
      {!rows.length ? (
        <Empty
          title="Cada movimiento cuenta"
          text="Usa Registrar movimiento en el encabezado para agregar gastos, pagos, comisiones o intereses."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha / tarjeta</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th className="numeric">Importe</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={m.voided ? "voided" : ""}>
                  <td>
                    {shortDate(m.value.date)}
                    <small>
                      {p.cards.find((c) => c.id === m.value.cardId)?.value.name}
                    </small>
                  </td>
                  <td>{m.value.description}</td>
                  <td>{labels[m.value.kind]}</td>
                  <td className="numeric">{money(m.value.amountCents)}</td>
                  <td>
                    <span className="tag">
                      {m.voided
                        ? "Anulado"
                        : m.value.reconciled
                          ? "Conciliado"
                          : m.value.scheduled || m.value.date > today
                            ? "Programado"
                            : "Realizado"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {!m.voided && !m.value.reconciled && (
                        <button
                          className="text-button"
                          onClick={() => modal({ type: "movement", id: m.id })}
                        >
                          Editar
                        </button>
                      )}
                      {!m.voided &&
                        (m.value.scheduled || m.value.date > today) && (
                          <button
                            className="text-button"
                            onClick={() =>
                              act(() =>
                                session
                                  .commands(today)
                                  .changeMovement(m.id, "realize"),
                              )
                            }
                          >
                            Realizar
                          </button>
                        )}
                      {!m.value.reconciled && (
                        <button
                          className="text-button"
                          onClick={() =>
                            act(() =>
                              session
                                .commands(today)
                                .changeMovement(
                                  m.id,
                                  m.voided ? "restore" : "void",
                                ),
                            )
                          }
                        >
                          {m.voided ? "Restaurar" : "Anular"}
                        </button>
                      )}
                      {!m.voided && m.value.kind === "payment" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            modal({ type: "allocation", id: m.id })
                          }
                        >
                          Distribuir entre cuotas
                        </button>
                      )}
                      {!m.voided && m.value.kind === "expense" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            modal({
                              type: "plan",
                              cardId: m.value.cardId,
                              purchaseId: m.id,
                            })
                          }
                        >
                          Dividir a meses
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function CalendarView({
  view,
  modal,
}: {
  view: FinanceView;
  modal: Modal;
}) {
  const [advance, setAdvance] = useState(() => {
    const saved = Number(localStorage.getItem("paymentplan-margin") ?? 2);
    return Number.isInteger(saved) && saved >= 0 && saved <= 10 ? saved : 2;
  });
  const rows = view.cards
    .flatMap((c) =>
      [...c.cuts.filter((s) => s.current), ...c.projections].map((s) => ({
        ...s,
        name: c.name,
      })),
    )
    .sort(
      (a, b) =>
        a.payday.localeCompare(b.payday) || a.dueDate.localeCompare(b.dueDate),
    );
  return (
    <section className="panel">
      <p className="caption">
        Calendario hasta {shortDate(view.horizon)}. Las proyecciones suponen que
        pagas cada periodo completo antes del siguiente corte, sin nuevas
        compras ni cargos. Nunca registran pagos reales.
      </p>
      <label className="field">
        <span>Días de anticipación del pago</span>
        <select
          value={advance}
          onChange={(e) => {
            const days = Number(e.target.value);
            setAdvance(days);
            localStorage.setItem("paymentplan-margin", String(days));
          }}
        >
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>
              {i} días
            </option>
          ))}
        </select>
        <small>
          La sugerencia nunca precede el ingreso del 15 o fin de mes ni cambia
          la quincena asignada. Preferencia de este dispositivo.
        </small>
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Quincena</th>
              <th>Tarjeta</th>
              <th>Corte</th>
              <th>Vencimiento</th>
              <th>Pago sugerido</th>
              <th className="numeric">Por pagar</th>
              <th>Origen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id + i}>
                <td>{shortDate(s.payday)}</td>
                <td>{s.name}</td>
                <td>{shortDate(s.cutDate)}</td>
                <td>{shortDate(s.dueDate)}</td>
                <td>{shortDate(suggestedPaymentDate(s.dueDate, advance))}</td>
                <td className="numeric">{money(s.pendingCents)}</td>
                <td>
                  {s.estimated
                    ? s.current
                      ? "Estimado vigente"
                      : "Proyección"
                    : "Confirmado"}
                  {s.current && s.cutDate <= view.today && (
                    <button
                      className="text-button"
                      onClick={() =>
                        modal({ type: "cut", cardId: s.cardId, cut: s })
                      }
                    >
                      Revisar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.obligations.length > 0 && (
        <>
          <h3>Compromisos con personas</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quincena</th>
                  <th>Persona</th>
                  <th>Fecha de pago</th>
                  <th className="numeric">Por pagar</th>
                </tr>
              </thead>
              <tbody>
                {view.obligations.map((o, i) => (
                  <tr key={i}>
                    <td>{shortDate(o.payday)}</td>
                    <td>{view.loans.find((l) => l.id === o.loanId)?.person}</td>
                    <td>{shortDate(o.dueDate)}</td>
                    <td className="numeric">{money(o.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!rows.length && !view.obligations.length && (
        <p className="muted">
          Registra una tarjeta o un préstamo para construir tu calendario.
        </p>
      )}
    </section>
  );
}
export function BudgetView({
  view,
  modal,
  p,
}: {
  view: FinanceView;
  modal: Modal;
  p: Portfolio;
}) {
  const [past, setPast] = useState(false);
  const dates = view.budgets.filter(
    (b) =>
      past ||
      b.payday >=
        (view.budgets.filter((b) => b.payday <= view.today).at(-1)?.payday ??
          view.today),
  );
  const focus = budgetFocus(p, view),
    statusLabel = {
      expected: "Esperado",
      toConfirm: "Por confirmar",
      received: "Recibido",
    } as const,
    focusLabels = {
      expenses: "Gastos esenciales",
      reserve: "Reserva",
      cards: "Tarjetas",
      loans: "Préstamos",
    } as const,
    focusIncome = focus ? (focus.receivedCents ?? focus.expectedCents) : 0,
    focusTotal = focus
      ? Math.max(
          focusIncome,
          focus.segments.reduce((sum, s) => sum + s.cents, 0),
        )
      : 0,
    waitingIncome = !!focus?.payroll?.canRecord && focus.payroll.recordedCents === null;
  return (
    <>
      {focus && focus.overdrafts.length > 0 && (
        <section className="alert-panel" role="alert">
          <h2>Posible faltante de dinero</h2>
          <ul>
            {focus.overdrafts.map((o) => (
              <li key={o.payday}>
                <span>
                  <strong>
                    Quincena del {shortDate(o.payday)}: faltan {money(o.shortCents)}
                  </strong>
                  <small>
                    {o.reserveCovers
                      ? "Tu reserva de esa quincena lo cubre; puedes reducirla."
                      : o.largest
                        ? `Valora pagar ${o.largest.name} (${money(o.largest.cents)}) en otra quincena o bajar gastos.`
                        : "Reduce gastos o reserva en esa quincena."}
                  </small>
                </span>
                <button
                  className="secondary"
                  onClick={() => modal({ type: "budget", payday: o.payday })}
                >
                  Ajustar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {focus && (
        <section className="panel budget-focus">
          <div className="section-heading">
            <div>
              <h2>Quincena del {shortDate(focus.payday)}</h2>
              <p className="caption">
                {focus.status === "toConfirm"
                  ? "Ya llegó la fecha: confirma cuánto recibiste."
                  : focus.status === "received"
                    ? "Ingreso confirmado."
                    : "Aún no llega el ingreso; los montos son estimados."}
              </p>
            </div>
            <span className={`status-badge status-${focus.status}`}>
              {statusLabel[focus.status]}
            </span>
          </div>
          <div className="focus-grid">
            <div>
              <small>Ingreso esperado</small>
              <strong>{money(focus.expectedCents)}</strong>
            </div>
            <div>
              <small>Ingreso recibido</small>
              <strong>
                {focus.receivedCents === null ? "—" : money(focus.receivedCents)}
              </strong>
            </div>
            <div>
              <small>Diferencia</small>
              <strong
                className={
                  focus.differenceCents !== null && focus.differenceCents < 0
                    ? "negative"
                    : ""
                }
              >
                {focus.differenceCents === null
                  ? "—"
                  : `${focus.differenceCents > 0 ? "+" : ""}${money(focus.differenceCents)}`}
              </strong>
            </div>
            <div>
              <small>Sobrante proyectado</small>
              <strong className={focus.leftoverCents < 0 ? "negative" : ""}>
                {money(focus.leftoverCents)}
              </strong>
            </div>
            {focus.accountBalanceCents !== null && focus.payroll && (
              <>
                <div>
                  <small>Saldo en {focus.payroll.accountName}</small>
                  <strong>{money(focus.accountBalanceCents)}</strong>
                </div>
                <div>
                  <small>Libre tras tarjetas y préstamos</small>
                  <strong
                    className={
                      (focus.accountFreeCents ?? 0) < 0 ? "negative" : ""
                    }
                  >
                    {money(focus.accountFreeCents ?? 0)}
                  </strong>
                </div>
              </>
            )}
          </div>
          <div className="focus-actions">
            {waitingIncome && focus.payroll && (
              <button
                className="primary"
                onClick={() => modal({ type: "payroll", payday: focus.payday })}
              >
                Registrar ingreso en {focus.payroll.accountName}
              </button>
            )}
            {!focus.payroll && focus.status === "toConfirm" && (
              <button
                className="primary"
                onClick={() => modal({ type: "budget", payday: focus.payday })}
              >
                Registrar ingreso recibido
              </button>
            )}
            {focus.canUpdateEstimate && (
              <button
                className="secondary"
                onClick={() => modal({ type: "estimate", payday: focus.payday })}
              >
                Actualizar estimado en Preferencias
              </button>
            )}
            <button
              className="text-button"
              onClick={() => modal({ type: "budget", payday: focus.payday })}
            >
              Editar quincena
            </button>
          </div>
          {focus.canUpdateEstimate && (
            <p className="caption">
              Recibiste un monto distinto al configurado. Si no actualizas
              Preferencias, solo esta quincena usa el monto real.
            </p>
          )}
          <div
            className="health-bar"
            role="img"
            aria-label={`Ingreso ${money(focusIncome)}, sobrante ${money(focus.leftoverCents)}`}
          >
            {focus.segments
              .filter((s) => s.cents > 0)
              .map((s) => (
                <span
                  key={s.key}
                  className={`seg-${s.key}`}
                  style={{ width: `${(s.cents / focusTotal) * 100}%` }}
                  title={`${focusLabels[s.key]} ${money(s.cents)}`}
                />
              ))}
            {focus.leftoverCents > 0 && (
              <span
                className="seg-left"
                style={{ width: `${(focus.leftoverCents / focusTotal) * 100}%` }}
                title={`Sobrante ${money(focus.leftoverCents)}`}
              />
            )}
          </div>
          <ul className="health-legend">
            {focus.segments.map((s) => (
              <li key={s.key}>
                <i className={`seg-${s.key}`} />
                {focusLabels[s.key]} <strong>{money(s.cents)}</strong>
              </li>
            ))}
          </ul>
          {(focus.cardPayments.length > 0 || focus.loanDues.length > 0) && (
            <>
              <h3>Pendiente en esta quincena</h3>
              <ul className="plain-list">
                {focus.cardPayments.map((c) => (
                  <li key={c.cardName + c.dueDate}>
                    <span>
                      {c.cardName}
                      <small>
                        vence {shortDate(c.dueDate)} ·{" "}
                        {c.estimated ? "estimado" : "confirmado"}
                      </small>
                    </span>
                    <strong>{money(c.pendingCents)}</strong>
                  </li>
                ))}
                {focus.loanDues.map((d) => (
                  <li key={d.loanId + d.dueDate}>
                    <span>
                      {d.person}
                      <small>
                        vence {shortDate(d.dueDate)}
                        {d.accountName ? ` · cargo en ${d.accountName}` : ""}
                      </small>
                    </span>
                    <span className="inline-actions">
                      <strong>{money(d.amountCents)}</strong>
                      {d.accountName && d.dueDate <= view.today &&
                        (waitingIncome ? (
                          <small>Confirma antes el ingreso</small>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() =>
                              modal({
                                type: "loanInstallment",
                                loanId: d.loanId,
                                dueDate: d.dueDate,
                              })
                            }
                          >
                            Pagar
                          </button>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    <section className="panel">
      <div className="section-heading">
        <p className="caption">
          Todas las quincenas hasta {shortDate(view.horizon)}. Reserva = dinero
          que conservas para imprevistos.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={past}
            onChange={(e) => setPast(e.target.checked)}
          />
          Ver quincenas anteriores
        </label>
      </div>
      <div className="table-wrap">
        <table className="budget-table">
          <thead>
            <tr>
              <th>Ingreso</th>
              <th className="numeric">Ingresos / préstamos</th>
              <th className="numeric">Gastos / reserva</th>
              <th className="numeric">Tarjetas</th>
              <th className="numeric">Personas</th>
              <th className="numeric">Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {dates.map((b) => (
              <tr
                key={b.payday}
                className={b.payday === focus?.payday ? "current-row" : ""}
              >
                <td data-label="Quincena">
                  {shortDate(b.payday)}
                  <span className={`status-badge status-${b.status}`}>
                    {statusLabel[b.status]}
                  </span>
                </td>
                <td className="numeric" data-label="Ingresos / préstamos">
                  {money(b.incomeCents + b.receivedLoanCents)}
                </td>
                <td className="numeric" data-label="Gastos / reserva">
                  {money(b.expensesCents + b.reserveCents)}
                </td>
                <td className="numeric" data-label="Tarjetas">
                  {money(b.pendingCents + b.cardPaidCents)}
                  <small>Pendiente {money(b.pendingCents)}</small>
                </td>
                <td className="numeric" data-label="Personas">
                  {money(b.loanPendingCents + b.loanPaidCents)}
                </td>
                <td
                  className={`numeric ${b.balanceCents < 0 ? "negative" : ""}`}
                  data-label="Balance"
                >
                  {money(b.balanceCents)}
                </td>
                <td className="row-actions">
                  <button
                    className="text-button"
                    onClick={() => modal({ type: "budget", payday: b.payday })}
                  >
                    Editar
                  </button>
                  {b.payroll &&
                    (b.payroll.recordedCents !== null ? (
                      <small>
                        Registrado en {b.payroll.accountName}:{" "}
                        {money(b.payroll.recordedCents)}
                      </small>
                    ) : (
                      b.payroll.canRecord && (
                        <button
                          className="text-button"
                          onClick={() =>
                            modal({ type: "payroll", payday: b.payday })
                          }
                        >
                          Registrar ingreso en {b.payroll.accountName}
                        </button>
                      )
                    ))}
                  {view.obligations
                    .filter(
                      (o) =>
                        o.payday === b.payday &&
                        o.chargeAccountName &&
                        o.dueDate <= view.today,
                    )
                    .map((o) =>
                      b.payroll?.canRecord &&
                      b.payroll.recordedCents === null ? (
                        <small key={o.loanId + o.dueDate}>
                          Confirma primero el ingreso para pagar{" "}
                          {view.loans.find((l) => l.id === o.loanId)?.person}
                        </small>
                      ) : (
                        <button
                          key={o.loanId + o.dueDate}
                          className="text-button"
                          onClick={() =>
                            modal({
                              type: "loanInstallment",
                              loanId: o.loanId,
                              dueDate: o.dueDate,
                            })
                          }
                        >
                          Pagar{" "}
                          {view.loans.find((l) => l.id === o.loanId)?.person}{" "}
                          {shortDate(o.dueDate)} desde {o.chargeAccountName}
                        </button>
                      ),
                    )}
                  <details>
                    <summary>Desglose</summary>
                    <p>
                      Ingreso: {money(b.incomeCents)} · préstamos recibidos:{" "}
                      {money(b.receivedLoanCents)}
                    </p>
                    <p>
                      Esenciales: {money(b.expensesCents)} · reserva:{" "}
                      {money(b.reserveCents)}
                    </p>
                    <p>
                      Pagado a tarjetas: {money(b.cardPaidCents)} · a personas:{" "}
                      {money(b.loanPaidCents)}
                    </p>
                    {view.cards.map((c) => {
                      const cuts = [
                        ...c.cuts.filter((s) => s.current),
                        ...c.projections,
                      ]
                        .filter((s) => s.payday === b.payday)
                        .toSorted((a, b) => b.cutDate.localeCompare(a.cutDate));
                      return (
                        cuts[0] && (
                          <p key={c.id}>
                            {c.name}: {money(cuts[0].pendingCents)} pendiente ·{" "}
                            {cuts[0].estimated ? "estimado" : "confirmado"} ·
                            vence {shortDate(cuts[0].dueDate)}
                          </p>
                        )
                      );
                    })}
                    {view.obligations
                      .filter((o) => o.payday === b.payday)
                      .map((o, i) => (
                        <p key={i}>
                          {view.loans.find((l) => l.id === o.loanId)?.person}:{" "}
                          {money(o.amountCents)} · vence {shortDate(o.dueDate)}
                        </p>
                      ))}
                    <p>
                      {
                        live(p.budgets).find((r) => r.value.payday === b.payday)
                          ?.value.note
                      }
                    </p>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a href="#/aprender">Entender reserva y presupuesto →</a>
    </section>
    </>
  );
}
export function LoansView({
  session,
  view,
  modal,
  act,
}: {
  session: VaultSession;
  view: FinanceView;
  modal: Modal;
  act: Act;
}) {
  const p = session.portfolio;
  return (
    <>
      <div className="section-heading">
        <p className="caption">
          Préstamos personales sin intereses y créditos bancarios con
          amortización mensual o quincenal estimada.
        </p>
        <button className="primary" onClick={() => modal({ type: "loan" })}>
          <Icon name="plus" size={16} /> Registrar préstamo
        </button>
      </div>
      {!view.loans.length && (
        <Empty
          title="Préstamos y créditos"
          text="Registra deudas personales o préstamos bancarios para organizar saldos y pagos."
        />
      )}
      <div className="loan-grid">
        {view.loans.map((l) => {
          const value = p.loans.find((r) => r.id === l.id)!.value;
          return (
            <article className="panel" key={l.id}>
              <div className="section-heading">
                <h2>{l.person}</h2>
                <span className="tag">
                  {value.archived
                    ? "Archivado"
                    : l.balanceCents === 0
                      ? "Liquidado"
                      : value.dueDate && value.dueDate < view.today
                        ? "Vencido"
                        : "Pendiente"}
                </span>
              </div>
              <p className="muted">{value.description}</p>
              {l.loanType === "bank" && (
                <p className="caption">
                  Préstamo bancario ·{" "}
                  {l.paymentFrequency === "biweekly" ? "quincenal" : "mensual"}{" "}
                  · tasa fija anual{" "}
                  {(l.annualRateBasisPoints! / 100).toFixed(2)}% · pago estimado{" "}
                  {money(l.installmentPaymentCents ?? 0)} · próximo vencimiento{" "}
                  {l.nextPaymentDate ? shortDate(l.nextPaymentDate) : "ninguno"}
                </p>
              )}
              <div className="loan-balance">
                <small>
                  {l.loanType === "bank"
                    ? "Saldo pendiente estimado"
                    : "Saldo pendiente"}
                </small>
                <strong>{money(l.balanceCents)}</strong>
              </div>
              <p className="caption">
                {l.loanType === "bank"
                  ? `Vencimiento final estimado: ${value.dueDate ? shortDate(value.dueDate) : "sin fecha"}`
                  : value.dueDate
                    ? `Pago acordado: ${shortDate(value.dueDate)}`
                    : "Sin fecha acordada"}{" "}
                · programado {money(l.scheduledCents)}
                {l.loanType === "bank" &&
                l.paymentFrequency === "biweekly" &&
                value.termMonths
                  ? ` · ${value.termMonths * 2} cuotas en ${value.termMonths} meses`
                  : ""}
              </p>
              {l.progressive && (
                <ProgressivePanel
                  loanId={l.id}
                  loan={value}
                  states={l.progressive}
                  session={session}
                  today={view.today}
                  act={act}
                />
              )}
              <div className="inline-actions">
                <button
                  className="secondary"
                  disabled={
                    value.archived || l.balanceCents <= l.scheduledCents
                  }
                  onClick={() => modal({ type: "loanPayment", loanId: l.id })}
                >
                  {l.loanType === "bank" ? "Registrar pago" : "Registrar abono"}
                </button>
                <button
                  className="text-button"
                  onClick={() => modal({ type: "loan", id: l.id })}
                >
                  Editar
                </button>
                {!p.loanPayments.some((a) => a.value.loanId === l.id) && (
                  <button
                    className="text-button danger"
                    onClick={() => {
                      if (window.confirm("Eliminar este préstamo sin abonos?"))
                        act(() =>
                          session.commands(view.today).deleteLoan(l.id),
                        );
                    }}
                  >
                    Eliminar
                  </button>
                )}
                {l.balanceCents === 0 && (
                  <button
                    className="text-button"
                    onClick={() =>
                      act(() =>
                        session
                          .commands(view.today)
                          .saveLoan(
                            { ...value, archived: !value.archived },
                            l.id,
                          ),
                      )
                    }
                  >
                    {value.archived ? "Reabrir" : "Archivar"}
                  </button>
                )}
              </div>
              <details className="payment-history">
                <summary>Historial de abonos</summary>
                {p.loanPayments
                  .filter((a) => a.value.loanId === l.id)
                  .map((a) => (
                    <div className="settings-row" key={a.id}>
                      <span>
                        {shortDate(a.value.date)} · {a.value.description}
                        <small>
                          {money(a.value.amountCents)} ·{" "}
                          {a.voided
                            ? "Anulado"
                            : a.value.scheduled || a.value.date > view.today
                              ? "Programado"
                              : "Realizado"}
                        </small>
                      </span>
                      <div className="row-actions">
                        {!a.voided && a.value.scheduled && (
                          <button
                            className="text-button"
                            onClick={() =>
                              act(() =>
                                session
                                  .commands(view.today)
                                  .changeLoanPayment(a.id, "realize"),
                              )
                            }
                          >
                            Realizar
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() =>
                            act(() =>
                              session
                                .commands(view.today)
                                .changeLoanPayment(
                                  a.id,
                                  a.voided ? "restore" : "void",
                                ),
                            )
                          }
                        >
                          {a.voided ? "Restaurar" : "Anular"}
                        </button>
                      </div>
                    </div>
                  ))}
              </details>
            </article>
          );
        })}
      </div>
    </>
  );
}
export { PeriodsView } from "./period-views.tsx";
function ProgressivePanel({
  loanId,
  loan,
  states,
  session,
  today,
  act,
}: {
  loanId: string;
  loan: Loan;
  states: NonNullable<LoanView["progressive"]>;
  session: VaultSession;
  today: string;
  act: Act;
}) {
  const [extra, setExtra] = useState(""),
    [installment, setInstallment] = useState(1);
  const terms = progressiveTerms(loan),
    base = progressiveSchedule(terms);
  const cents = Math.round(Number(extra.replace(/[^0-9.]/g, "")) * 100) || 0;
  const simulated =
    cents > 0 ? progressiveSchedule(terms, { [installment]: cents }) : base;
  const sum = (rows: typeof base, key: "interestCents" | "vatCents") =>
    rows.reduce((total, row) => total + row[key], 0);
  const setExempt = (dueDate: string, text: string) => {
    const overrides = (loan.exemptInterestOverrides ?? []).filter(
      (item) => item.dueDate !== dueDate,
    );
    if (text.trim() !== "") {
      const amountCents = Math.round(
        Number(text.replace(/[^0-9.]/g, "")) * 100,
      );
      if (!Number.isSafeInteger(amountCents) || amountCents < 0) return;
      overrides.push({ dueDate, amountCents });
    }
    if (
      overrides.length === (loan.exemptInterestOverrides ?? []).length &&
      overrides.every((item) =>
        (loan.exemptInterestOverrides ?? []).some(
          (old) =>
            old.dueDate === item.dueDate &&
            old.amountCents === item.amountCents,
        ),
      )
    )
      return;
    act(() =>
      session
        .commands(today)
        .saveLoan(
          {
            ...loan,
            exemptInterestOverrides: overrides.toSorted((a, b) =>
              a.dueDate.localeCompare(b.dueDate),
            ),
          },
          loanId,
        ),
    );
  };
  const overridden = new Set(
    (loan.exemptInterestOverrides ?? []).map((item) => item.dueDate),
  );
  return (
    <>
      <div className="loan-balance">
        <small>Monto utilizado (deuda real)</small>
        <strong>{money(states.usedAmountCents)}</strong>
      </div>
      <p className="caption">
        Saldo al corte
        {states.lastStatementDate
          ? ` (${shortDate(states.lastStatementDate)})`
          : ""}
        : {money(states.statementBalanceCents)} · Saldo al día:{" "}
        {money(states.balanceToDateCents)} (incluye{" "}
        {money(states.accruedInterestCents)} de interés devengado) ·{" "}
        {states.remainingInstallments} cuotas restantes
      </p>
      <details>
        <summary>Tabla de amortización y abono extra</summary>
        <div className="inline-actions">
          <label className="field">
            <span>Abono extra a capital</span>
            <input
              inputMode="decimal"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="field">
            <span>En la cuota</span>
            <input
              type="number"
              min={1}
              max={base.length}
              value={installment}
              onChange={(e) =>
                setInstallment(
                  Math.min(
                    base.length,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                )
              }
            />
          </label>
        </div>
        {cents > 0 && (
          <p className="caption" role="status">
            Reducción de plazo: {simulated.length} cuotas en lugar de{" "}
            {base.length}. Intereses e IVA ahorrados:{" "}
            {money(
              sum(base, "interestCents") +
                sum(base, "vatCents") -
                sum(simulated, "interestCents") -
                sum(simulated, "vatCents"),
            )}
            . Es una simulación: para aplicarlo, registra el pago y actualiza el
            saldo actual del préstamo.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th className="numeric">Días</th>
                <th className="numeric">Capital</th>
                <th className="numeric">Interés</th>
                <th className="numeric">Exento real</th>
                <th className="numeric">IVA</th>
                <th className="numeric">Pago</th>
                <th className="numeric">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {simulated.map((row, i) => (
                <tr key={row.dueDate}>
                  <td>{i + 1}</td>
                  <td>{shortDate(row.dueDate)}</td>
                  <td className="numeric">{row.days}</td>
                  <td className="numeric">{money(row.capitalCents)}</td>
                  <td className="numeric">{money(row.interestCents)}</td>
                  <td className="numeric">
                    {cents > 0 ? (
                      money(row.exemptInterestCents)
                    ) : (
                      <input
                        aria-label={`Interés exento real de la cuota ${i + 1}`}
                        inputMode="decimal"
                        key={`${row.dueDate}-${row.exemptInterestCents}-${overridden.has(row.dueDate)}`}
                        defaultValue={
                          overridden.has(row.dueDate)
                            ? (row.exemptInterestCents / 100).toFixed(2)
                            : ""
                        }
                        placeholder={(row.exemptInterestCents / 100).toFixed(2)}
                        onBlur={(e) => setExempt(row.dueDate, e.target.value)}
                        size={8}
                      />
                    )}
                  </td>
                  <td className="numeric">{money(row.vatCents)}</td>
                  <td className="numeric">{money(row.paymentCents)}</td>
                  <td className="numeric">{money(row.closingBalanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
