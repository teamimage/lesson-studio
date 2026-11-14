import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A Buy tap from a studio store: note the tap (which teacher's store, which
// product) and send the family on to the retailer's link. Nothing about the
// child goes to the retailer.
export async function GET(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const teacherId = new URL(req.url).searchParams.get("t");
  const supabase = await createClient();
  const { data: product } = await supabase.from("store_products").select("url").eq("id", productId).maybeSingle();
  if (!product?.url?.startsWith("https://")) {
    return NextResponse.redirect(new URL("/family?store=missing", req.url));
  }
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (userId) {
    const uuid = /^[0-9a-f-]{36}$/i;
    await supabase.from("store_clicks").insert({
      product_id: productId,
      teacher_id: teacherId && uuid.test(teacherId) ? teacherId : null,
      user_id: userId,
    });
  }
  return NextResponse.redirect(product.url, { status: 302 });
}
