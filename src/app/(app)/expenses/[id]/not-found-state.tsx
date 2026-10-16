import Link from "next/link";
import { cardClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";

/** Shown when an expense doesn't exist or isn't the viewer's to see; no detail is given away. */
export function ExpenseNotFound() {
  return (
    <div className={cardClass}>
      <p className="text-sm">{expensesCopy.errors.notFound}</p>
      <Link href="/" className={linkClass}>
        {expensesCopy.view.backHome}
      </Link>
    </div>
  );
}
